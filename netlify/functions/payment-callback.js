// netlify/functions/payment-callback.js
// Route: POST /api/payment-callback
//
// NewebPay (藍新金流) calls this URL automatically in the background
// after a credit card payment succeeds — this is the "NotifyURL".
//
// ⚠ This is NOT the page the user is redirected to.
//    Set this as "NotifyURL" in your NewebPay merchant dashboard.
//    Set your thank-you page URL as "ReturnURL" separately.
//
// Required env vars:
//   DATABASE_URL       — Neon connection string
//   RESEND_API_KEY     — from resend.com
//   NEWEBPAY_HASH_KEY  — from NewebPay merchant dashboard
//   NEWEBPAY_HASH_IV   — from NewebPay merchant dashboard

const { Client } = require("pg");
const crypto = require("crypto");

// ── NewebPay AES-256-CBC decrypt ────────────────────────────
function decryptNewebpay(tradeInfo) {
  const key = process.env.NEWEBPAY_HASH_KEY;
  const iv  = process.env.NEWEBPAY_HASH_IV;
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  decipher.setAutoPadding(false);
  let decrypted = decipher.update(tradeInfo, "hex", "utf8");
  decrypted += decipher.final("utf8");
  // Remove PKCS7 padding
  decrypted = decrypted.replace(/[\x00-\x20]+$/g, "");
  return Object.fromEntries(new URLSearchParams(decrypted));
}

// ── SHA256 verify ────────────────────────────────────────────
function verifyChecksum(tradeInfo, tradeSha, hashKey, hashIv) {
  const str = `HashKey=${hashKey}&${tradeInfo}&HashIV=${hashIv}`;
  const hash = crypto.createHash("sha256").update(str).digest("hex").toUpperCase();
  return hash === tradeSha;
}

// ── Confirmation email ───────────────────────────────────────
async function sendConfirmationEmail({ name, email, order_no, session, ticket_type, finalPrice }) {
  const ticketLabel = ticket_type === "kol" ? "KOL 優惠票（單張）" : "四套課程超值方案";
  const priceStr = "NT$" + Number(finalPrice).toLocaleString();

  const html = `
    <div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:#0E0B05;color:#FAF6EE;padding:36px;border:2px solid #C9A84C;">
      <h2 style="color:#C9A84C;margin-top:0;font-size:22px;">✅ 付款成功 — 報名確認通知</h2>
      <p style="font-size:15px;">親愛的 <strong>${name}</strong>，您的信用卡付款已完成，報名正式成立！</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:24px 0;">
        <tr style="border-bottom:1px solid rgba(201,168,76,.2);">
          <td style="padding:10px 0;color:#7A6E5F;width:130px;">訂單編號</td>
          <td style="padding:10px 0;font-weight:bold;color:#C9A84C;font-size:17px;letter-spacing:2px;">${order_no}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(201,168,76,.2);">
          <td style="padding:10px 0;color:#7A6E5F;">課程場次</td>
          <td style="padding:10px 0;">${session}（週日）13:30 – 16:45</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(201,168,76,.2);">
          <td style="padding:10px 0;color:#7A6E5F;">上課地點</td>
          <td style="padding:10px 0;">台北市中正區重慶南路一段10號 6F 608室<br>
            <span style="color:#7A6E5F;font-size:12px;">（台北車站 Z10 出口步行 3 分鐘）</span></td>
        </tr>
        <tr style="border-bottom:1px solid rgba(201,168,76,.2);">
          <td style="padding:10px 0;color:#7A6E5F;">票種</td>
          <td style="padding:10px 0;">${ticketLabel}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(201,168,76,.2);">
          <td style="padding:10px 0;color:#7A6E5F;">付款方式</td>
          <td style="padding:10px 0;">信用卡（已完成）</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#7A6E5F;">實付金額</td>
          <td style="padding:10px 0;font-size:20px;font-weight:bold;color:#C9A84C;">${priceStr}</td>
        </tr>
      </table>

      <div style="background:rgba(192,57,43,.08);border:1px solid rgba(192,57,43,.25);padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:rgba(250,246,238,.7);line-height:2;">
          ⚠ 上課請攜帶身分證以供報到查驗<br>
          ⚠ 全程禁止錄音錄影<br>
          ⚠ 刷卡完款超過七日後無法申請退款，課程開始後恕無法退款
        </p>
      </div>

      <p style="font-size:12px;color:#7A6E5F;margin:0;">
        此為系統自動寄出，如有疑問請來電洽詢<br>
        📞 台北 02-2331-8260｜台中&amp;高雄 04-3506-5968<br>
        主辦單位｜富豐企管顧問有限公司
      </p>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "富豐企管報名系統 <onboarding@resend.dev>",
      to: [email],
      subject: `【付款成功】杜金龍四季贏家選股策略班｜訂單 ${order_no}`,
      html,
    }),
  });
}

// ── Main handler ─────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // NewebPay posts as application/x-www-form-urlencoded
  const params = Object.fromEntries(new URLSearchParams(event.body));
  const { Status, MerchantID, TradeInfo, TradeSha } = params;

  // 1. Verify the SHA256 checksum to confirm this is really from NewebPay
  const isValid = verifyChecksum(
    TradeInfo,
    TradeSha,
    process.env.NEWEBPAY_HASH_KEY,
    process.env.NEWEBPAY_HASH_IV
  );

  if (!isValid) {
    console.error("NewebPay checksum mismatch — possible forgery");
    return { statusCode: 400, body: "Checksum mismatch" };
  }

  // 2. Only process successful payments
  if (Status !== "SUCCESS") {
    console.log("Payment not successful, status:", Status);
    return { statusCode: 200, body: "OK" }; // Always return 200 to NewebPay
  }

  // 3. Decrypt the trade info
  let trade;
  try {
    trade = decryptNewebpay(TradeInfo);
  } catch (e) {
    console.error("Decrypt failed:", e);
    return { statusCode: 200, body: "OK" };
  }

  // trade.MerchantOrderNo is the order_no you saved during /api/register
  const order_no = trade.MerchantOrderNo;
  const amtPaid  = trade.Amt;

  if (!order_no) {
    console.error("No MerchantOrderNo in trade data");
    return { statusCode: 200, body: "OK" };
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // 4. Look up the registration by order_no
    const result = await client.query(
      `SELECT name, email, session_date, ticket_type, final_price
       FROM registrations
       WHERE order_no = $1 LIMIT 1`,
      [order_no]
    );

    if (result.rows.length === 0) {
      console.error("Order not found:", order_no);
      return { statusCode: 200, body: "OK" };
    }

    const reg = result.rows[0];

    // 5. Mark order as paid in the database
    await client.query(
      `UPDATE registrations
       SET payment_status = 'paid', paid_at = NOW(), newebpay_trade_no = $1
       WHERE order_no = $2`,
      [trade.TradeNo || null, order_no]
    );

    // 6. Send confirmation email now that payment is confirmed
    await sendConfirmationEmail({
      name:        reg.name,
      email:       reg.email,
      order_no,
      session:     reg.session_date,
      ticket_type: reg.ticket_type,
      finalPrice:  reg.final_price,
    });

    console.log(`✅ Payment confirmed and email sent for order ${order_no}`);
    return { statusCode: 200, body: "OK" };

  } catch (err) {
    console.error("payment-callback error:", err);
    return { statusCode: 200, body: "OK" }; // Always 200 to NewebPay
  } finally {
    await client.end();
  }
};
