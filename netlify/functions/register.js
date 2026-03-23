// netlify/functions/register.js
// Route: POST /api/register
const { Client } = require("pg");

// Generate order number: ORD-YYYYMMDD-XXXXXX
function genOrderNo() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${date}-${rand}`;
}

// ─────────────────────────────────────────────────────────────
// ✅ NEW: Confirmation email helper (uses Resend, same as kol-apply.js)
// ─────────────────────────────────────────────────────────────
async function sendConfirmationEmail({ name, email, order_no, session, ticket_type, finalPrice, payment }) {
  const ticketLabel = ticket_type === "kol" ? "KOL 優惠票（單張）" : "四套課程超值方案";
  const paymentLabel = payment === "transfer" ? "現金轉帳／匯款" : "信用卡";
  const priceStr = "NT$" + finalPrice.toLocaleString();

  const html = `
    <div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:#0E0B05;color:#FAF6EE;padding:36px;border:2px solid #C9A84C;">
      <h2 style="color:#C9A84C;margin-top:0;font-size:22px;">📋 報名確認通知</h2>
      <p style="font-size:15px;">親愛的 <strong>${name}</strong>，感謝您報名杜金龍老師四季贏家選股策略班！</p>

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
          <td style="padding:10px 0;">台北市中正區重慶南路一段10號 6F 608室<br><span style="color:#7A6E5F;font-size:12px;">（台北車站 Z10 出口步行 3 分鐘）</span></td>
        </tr>
        <tr style="border-bottom:1px solid rgba(201,168,76,.2);">
          <td style="padding:10px 0;color:#7A6E5F;">票種</td>
          <td style="padding:10px 0;">${ticketLabel}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(201,168,76,.2);">
          <td style="padding:10px 0;color:#7A6E5F;">付款方式</td>
          <td style="padding:10px 0;">${paymentLabel}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#7A6E5F;">應付金額</td>
          <td style="padding:10px 0;font-size:20px;font-weight:bold;color:#C9A84C;">${priceStr}</td>
        </tr>
      </table>

      ${payment === "transfer" ? `
      <div style="background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.3);padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 8px;font-weight:bold;color:#C9A84C;">💳 匯款資訊</p>
        <p style="margin:0;font-size:13px;line-height:2;color:rgba(250,246,238,.8);">
          請依頁面上方匯款資訊完成轉帳<br>
          匯款後請來電告知帳號末五碼及發票載具<br>
          📞 台北 02-2331-8260｜台中&amp;高雄 04-3506-5968
        </p>
      </div>
      ` : ""}

      <div style="background:rgba(192,57,43,.08);border:1px solid rgba(192,57,43,.25);padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:rgba(250,246,238,.7);line-height:2;">
          ⚠ 上課請攜帶身分證以供報到查驗<br>
          ⚠ 全程禁止錄音錄影<br>
          ⚠ 刷卡完款超過七日後無法申請退款，課程開始後恕無法退款
        </p>
      </div>

      <p style="font-size:12px;color:#7A6E5F;margin:0;">
        此為系統自動寄出，如有疑問請來電洽詢<br>
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
      subject: `【報名確認】杜金龍四季贏家選股策略班｜訂單 ${order_no}`,
      html,
    }),
  });
}
// ─────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const {
    name,
    email,
    phone,
    session,
    is_member,
    region,
    payment,
    referral_code,
    ticket_type,
    ticket_tier_id,
    quantity,
  } = body;

  // Validation
  if (!name || !email || !phone || !session || !is_member || !region || !payment) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "請完整填寫所有必選欄位" }),
    };
  }

  if (!["solo", "kol"].includes(ticket_type)) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid ticket_type" }),
    };
  }

  if (!["credit_card", "transfer", "cash"].includes(payment)) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid payment method" }),
    };
  }

  // Calculate price
  const KOL_DISCOUNT = 4500;
  const basePrice = ticket_type === "kol" ? 4500 : 18000;
  const discountAmount = referral_code ? KOL_DISCOUNT : 0;
  const finalPrice = Math.max(0, basePrice - discountAmount);

  const order_no = genOrderNo();

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // Verify referral code is valid if provided
    let validatedReferral = null;
    if (referral_code) {
      const kolCheck = await client.query(
        `SELECT referral_code FROM kols WHERE referral_code = $1 AND is_active = true LIMIT 1`,
        [referral_code.toUpperCase()]
      );
      if (kolCheck.rows.length > 0) {
        validatedReferral = referral_code.toUpperCase();
      }
    }

    // Insert registration
    await client.query(
      `INSERT INTO registrations
         (order_no, name, email, phone, session_date, is_member, region,
          payment_method, referral_code, ticket_type, ticket_tier_id,
          quantity, base_price, discount_amount, final_price, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())`,
      [
        order_no,
        name.trim(),
        email.trim().toLowerCase(),
        phone.trim(),
        session,
        is_member,
        region,
        payment,
        validatedReferral,
        ticket_type,
        ticket_tier_id || (ticket_type === "kol" ? 1 : 2),
        quantity || 1,
        basePrice,
        discountAmount,
        finalPrice,
      ]
    );

    // Increment KOL usage count if referral used
    if (validatedReferral) {
      await client.query(
        `UPDATE kols SET usage_count = COALESCE(usage_count, 0) + 1 WHERE referral_code = $1`,
        [validatedReferral]
      );
    }

    // ─────────────────────────────────────────────────────────
    // ✅ NEW: Send confirmation email for transfer payments only.
    //    Credit card payments are handled by payment-callback.js
    //    after NewebPay confirms payment via webhook.
    // ─────────────────────────────────────────────────────────
    if (payment === "transfer" || payment === "cash") {
      try {
        await sendConfirmationEmail({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          order_no,
          session,
          ticket_type,
          finalPrice,
          payment,
        });
      } catch (emailErr) {
        // Don't fail the registration if email fails — just log it
        console.error("Confirmation email failed:", emailErr);
      }
    }
    // ─────────────────────────────────────────────────────────

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        order_no,
        message: "報名成功！",
        final_price: finalPrice,
      }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Database error — 請稍後再試" }),
    };
  } finally {
    await client.end();
  }
};
