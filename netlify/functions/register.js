// netlify/functions/register.js
// Route: POST /api/register
// Saves registration to PostgreSQL AND sends confirmation email via Resend
// Required env vars: DATABASE_URL, RESEND_API_KEY, ADMIN_EMAIL

const { Client } = require("pg");

function genOrderNo() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${date}-${rand}`;
}

// ── row() must be defined BEFORE buildEmailHtml uses it ──────────────────────
function row(label, value) {
  return (
    "<tr>" +
    "<td style='padding:11px 22px;border-bottom:1px solid rgba(201,168,76,.08);color:rgba(250,246,238,.5);font-size:12px;width:40%;vertical-align:top;'>" +
    label +
    "</td>" +
    "<td style='padding:11px 22px;border-bottom:1px solid rgba(201,168,76,.08);color:#FAF6EE;font-size:14px;vertical-align:top;'>" +
    value +
    "</td>" +
    "</tr>"
  );
}

function buildEmailHtml({
  order_no,
  name,
  email,
  phone,
  payment,
  ticket_type,
  referral_code,
  amount,
}) {
  const paymentLabel =
    payment === "credit_card" ? "信用卡線上刷卡" : "現金轉帳／匯款";
  const ticketLabel =
    ticket_type === "kol" && referral_code
      ? "KOL 優惠票（推薦碼：" + referral_code + "）"
      : "標準票";
  const amountFmt = Number(amount).toLocaleString("zh-TW");

  const paymentNote =
    payment === "credit_card"
      ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px 20px;margin:20px 0;">
           <p style="margin:0;color:#166534;font-weight:700;font-size:15px;">信用卡付款注意事項</p>
           <p style="margin:8px 0 0;color:#166534;font-size:14px;line-height:1.8;">
             您的付款連結已在報名後自動開啟。<br>
             若尚未完成付款，請聯繫客服重新取得付款連結。<br>
             付款完成後視為正式報名成立。
           </p>
         </div>`
      : `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px 20px;margin:20px 0;">
           <p style="margin:0;color:#92400e;font-weight:700;font-size:15px;">匯款注意事項</p>
           <ul style="margin:8px 0 0;padding-left:18px;color:#92400e;font-size:14px;line-height:2;">
             <li>請依報名頁面上的匯款資訊完成轉帳</li>
             <li>匯款後請來電告知帳號末五碼及發票載具</li>
             <li>台北：02-2331-8260</li>
             <li>台中 &amp; 高雄：04-3506-5968</li>
           </ul>
         </div>`;

  return (
    "<!DOCTYPE html><html lang='zh-TW'><head><meta charset='UTF-8'></head>" +
    "<body style='margin:0;padding:0;background:#f5f0e8;font-family:Arial,sans-serif;'>" +
    "<table width='100%' cellpadding='0' cellspacing='0' style='background:#f5f0e8;padding:32px 0;'>" +
    "<tr><td align='center'>" +
    "<table width='600' cellpadding='0' cellspacing='0' style='max-width:600px;width:100%;background:#0E0B05;border-radius:4px;overflow:hidden;border:1px solid #C9A84C;'>" +
    "<tr><td style='background:#1A0800;padding:36px 40px;text-align:center;border-bottom:2px solid #C9A84C;'>" +
    "<p style='margin:0 0 6px;color:rgba(250,246,238,.55);font-size:11px;letter-spacing:4px;'>富豐企管顧問有限公司</p>" +
    "<h1 style='margin:0;color:#C9A84C;font-size:26px;font-weight:900;'>四季贏家選股策略班</h1>" +
    "<p style='margin:8px 0 0;color:rgba(250,246,238,.7);font-size:13px;'>杜金龍老師｜報名確認通知</p>" +
    "</td></tr>" +
    "<tr><td style='padding:32px 40px;'>" +
    "<p style='color:#FAF6EE;font-size:15px;line-height:1.8;margin:0 0 20px;'>親愛的 <strong style='color:#C9A84C;'>" +
    name +
    "</strong> 您好，<br>感謝您報名杜金龍老師【四季贏家選股策略班】，以下是您的報名資訊，請妥善保存。</p>" +
    "<table width='100%' cellpadding='0' cellspacing='0' style='background:rgba(201,168,76,.06);border:1px solid rgba(201,168,76,.22);border-radius:4px;margin-bottom:20px;'>" +
    "<tr><td style='padding:18px 22px;border-bottom:1px solid rgba(201,168,76,.12);'>" +
    "<p style='margin:0;font-size:11px;color:rgba(250,246,238,.45);letter-spacing:2px;'>訂單編號</p>" +
    "<p style='margin:4px 0 0;font-size:20px;font-weight:700;color:#F0D080;letter-spacing:3px;'>" +
    order_no +
    "</p>" +
    "</td></tr>" +
    "<tr><td style='padding:0;'><table width='100%' cellpadding='0' cellspacing='0'>" +
    row("姓名", name) +
    row("電子信箱", email) +
    row("手機號碼", phone) +
    row("上課日期", "2026年05月03日（週日）13:30 – 16:45") +
    row("上課地點", "台北市中正區重慶南路一段10號 6F 608室") +
    row("票種", ticketLabel) +
    row("付款方式", paymentLabel) +
    row(
      "應付金額",
      "<strong style='color:#C9A84C;font-size:18px;'>NT$" +
        amountFmt +
        "</strong>"
    ) +
    "</table></td></tr></table>" +
    paymentNote +
    "<div style='border-left:3px solid #C9A84C;padding:14px 18px;margin:20px 0;'>" +
    "<p style='margin:0 0 8px;color:#C9A84C;font-weight:700;font-size:13px;'>上課注意事項</p>" +
    "<ul style='margin:0;padding-left:18px;color:rgba(250,246,238,.7);font-size:13px;line-height:2.2;'>" +
    "<li>上課請攜帶身分證供報到查驗</li>" +
    "<li>全程禁止錄音錄影</li>" +
    "<li>刷卡完款超過七日後無法申請退款</li>" +
    "<li>課程開始後恕無法退款</li>" +
    "</ul></div>" +
    "<p style='color:rgba(250,246,238,.6);font-size:13px;line-height:2;margin:20px 0 0;'>" +
    "如有任何疑問，請聯繫我們：<br>" +
    "台北：<strong style='color:#FAF6EE;'>02-2331-8260</strong><br>" +
    "台中 &amp; 高雄：<strong style='color:#FAF6EE;'>04-3506-5968</strong>" +
    "</p>" +
    "</td></tr>" +
    "<tr><td style='background:#0A0700;padding:20px 40px;text-align:center;border-top:1px solid rgba(201,168,76,.15);'>" +
    "<p style='margin:0;color:rgba(250,246,238,.3);font-size:11px;line-height:2;'>富豐企管顧問有限公司<br>此為系統自動發送，請勿直接回覆此信件</p>" +
    "</td></tr>" +
    "</table></td></tr></table></body></html>"
  );
}

// ── sendConfirmationEmail now THROWS on failure so the caller can log it ─────
async function sendConfirmationEmail(data) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email");
    return;
  }

  const html = buildEmailHtml(data);

  // IMPORTANT: `from` must use your VERIFIED domain in Resend.
  // Log into resend.com → Domains to confirm which domain is verified.
  // Common options: noreply@fufong.com.tw  OR  noreply@mail.fufong.com.tw
  const fromAddress = "富豐企管 <noreply@rich3051.tw>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.RESEND_API_KEY,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [data.email],
      subject: "【報名確認】四季贏家選股策略班｜訂單 " + data.order_no,
      html,
    }),
  });

  const resData = await res.json();

  if (!res.ok) {
    // Log the full Resend error — visible in Netlify function logs
    console.error("Resend API error:", JSON.stringify(resData));
    throw new Error(
      "Resend rejected the email: " + (resData.message || JSON.stringify(resData))
    );
  }

  console.log(
    "Confirmation email sent OK — id:",
    resData.id,
    "to:",
    data.email
  );
}

exports.handler = async (event) => {
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
    five_numbers_bank,
  } = body;

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

  if (payment === "transfer" && !/^\d{5}$/.test(five_numbers_bank)) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "請填寫正確的匯款帳號後五碼（5位數字）" }),
    };
  }

  const isKol = ticket_type === "kol";
  const basePrice = isKol ? 4500 : 9800;
  const discountAmount = isKol && referral_code ? 5300 : 0;
  const finalPrice = Math.max(0, basePrice - discountAmount);
  const order_no = genOrderNo();

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    let validatedReferral = null;
    if (referral_code) {
      const kolCheck = await client.query(
        "SELECT referral_code FROM kols WHERE referral_code = $1 AND is_active = true LIMIT 1",
        [referral_code.toUpperCase()]
      );
      if (kolCheck.rows.length > 0)
        validatedReferral = referral_code.toUpperCase();
    }

    await client.query(
      `INSERT INTO registrations
         (order_no, name, email, phone, session_date, is_member, region,
          payment_method, referral_code, ticket_type, ticket_tier_id,
          quantity, base_price, discount_amount, final_price,
          five_numbers_bank, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())`,
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
        ticket_tier_id || (isKol ? 1 : 2),
        quantity || 1,
        basePrice,
        discountAmount,
        finalPrice,
        payment === "transfer" ? five_numbers_bank : null,
      ]
    );

    if (validatedReferral) {
      await client.query(
        "UPDATE kols SET usage_count = COALESCE(usage_count, 0) + 1 WHERE referral_code = $1",
        [validatedReferral]
      );
    }

    // ── Send confirmation email ─────────────────────────────────────────────
    // Wrapped in try/catch so an email failure does NOT roll back the registration.
    // The order is already saved — we log the error and still return success.
    try {
      await sendConfirmationEmail({
        order_no,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        payment,
        ticket_type,
        referral_code: validatedReferral,
        amount: finalPrice,
      });
    } catch (emailErr) {
      // Email failed but registration is saved — log for Netlify function logs
      console.error("⚠️  Registration saved but confirmation email failed:", emailErr.message);
      // Optionally surface this to the client as a warning (non-blocking)
    }

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
    console.error("DB error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Database error — 請稍後再試" }),
    };
  } finally {
    await client.end();
  }
};
