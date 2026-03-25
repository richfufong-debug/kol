// netlify/functions/send-confirmation.js
// Route: POST /api/send-confirmation
// Sends a confirmation email after registration using Resend (https://resend.com)
// Required env var: RESEND_API_KEY

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
    order_no,
    name,
    email,
    phone,
    session,
    payment,
    ticket_type,
    referral_code,
    amount,
  } = body;

  if (!order_no || !name || !email) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Missing required fields" }),
    };
  }

  const paymentLabel =
    payment === "credit_card"
      ? "✅ 信用卡線上刷卡"
      : "🏦 現金轉帳／匯款";

  const isKol = ticket_type === "kol" && referral_code;
  const ticketLabel = isKol
    ? `KOL 優惠票（推薦碼：${referral_code}）`
    : "標準票";

  const amountFormatted = Number(amount).toLocaleString("zh-TW");

  // Payment-specific instructions block
  const paymentNote =
    payment === "credit_card"
      ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px 20px;margin:20px 0;">
           <p style="margin:0;color:#166534;font-weight:700;font-size:15px;">💳 信用卡付款注意事項</p>
           <p style="margin:8px 0 0;color:#166534;font-size:14px;line-height:1.8;">
             您的付款連結已在報名後自動開啟。<br>
             若尚未完成付款，請至原報名頁面重新提交或直接聯繫客服。<br>
             付款完成後視為正式報名成立。
           </p>
         </div>`
      : `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px 20px;margin:20px 0;">
           <p style="margin:0;color:#92400e;font-weight:700;font-size:15px;">🏦 匯款注意事項</p>
           <ul style="margin:8px 0 0;padding-left:18px;color:#92400e;font-size:14px;line-height:2;">
             <li>請依上方匯款資訊完成轉帳</li>
             <li>匯款後請來電告知帳號末五碼及發票載具</li>
             <li>📞 台北：02-2331-8260</li>
             <li>📞 台中 &amp; 高雄：04-3506-5968</li>
           </ul>
         </div>`;

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>報名確認｜四季贏家選股策略班</title></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Noto Sans TC',Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0E0B05;border-radius:4px;overflow:hidden;border:1px solid #C9A84C;">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#1A0800,#3D1200);padding:36px 40px;text-align:center;border-bottom:2px solid #C9A84C;">
      <p style="margin:0 0 6px;color:rgba(250,246,238,.55);font-size:11px;letter-spacing:4px;">富豐企管顧問有限公司</p>
      <h1 style="margin:0;color:#C9A84C;font-size:26px;font-weight:900;letter-spacing:2px;">四季贏家選股策略班</h1>
      <p style="margin:8px 0 0;color:rgba(250,246,238,.7);font-size:13px;letter-spacing:1px;">杜金龍老師｜報名確認通知</p>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="padding:32px 40px;">

      <p style="color:#FAF6EE;font-size:15px;line-height:1.8;margin:0 0 20px;">
        親愛的 <strong style="color:#C9A84C;">${name}</strong> 您好，<br>
        感謝您報名杜金龍老師【四季贏家選股策略班】，以下是您的報名資訊，請妥善保存。
      </p>

      <!-- ORDER INFO TABLE -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:rgba(201,168,76,.06);border:1px solid rgba(201,168,76,.22);
                    border-radius:4px;margin-bottom:20px;">
        <tr>
          <td style="padding:18px 22px;border-bottom:1px solid rgba(201,168,76,.12);">
            <p style="margin:0;font-size:11px;color:rgba(250,246,238,.45);letter-spacing:2px;">訂單編號</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#F0D080;letter-spacing:3px;">${order_no}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${row("👤 姓名", name)}
              ${row("📧 電子信箱", email)}
              ${row("📱 手機號碼", phone)}
              ${row("📅 上課日期", "2026年05月03日（週日）13:30 – 16:45")}
              ${row("📍 上課地點", "台北市中正區重慶南路一段10號 6F 608室<br><span style='font-size:12px;color:rgba(250,246,238,.4);'>（台北車站 Z10 出口步行3分鐘）</span>")}
              ${row("🎟 票種", ticketLabel)}
              ${row("💳 付款方式", paymentLabel)}
              ${row("💰 應付金額", `<strong style='color:#C9A84C;font-size:18px;'>NT$${amountFormatted}</strong>`)}
            </table>
          </td>
        </tr>
      </table>

      ${paymentNote}

      <!-- REMINDERS -->
      <div style="background:rgba(255,255,255,.03);border-left:3px solid #C9A84C;
                  padding:14px 18px;margin:20px 0;border-radius:0 4px 4px 0;">
        <p style="margin:0 0 8px;color:#C9A84C;font-weight:700;font-size:13px;letter-spacing:1px;">⚠ 上課注意事項</p>
        <ul style="margin:0;padding-left:18px;color:rgba(250,246,238,.7);font-size:13px;line-height:2.2;">
          <li>上課請攜帶身分證供報到查驗</li>
          <li>全程禁止錄音錄影</li>
          <li>刷卡完款超過七日後無法申請退款</li>
          <li>課程開始後恕無法退款</li>
        </ul>
      </div>

      <p style="color:rgba(250,246,238,.6);font-size:13px;line-height:2;margin:20px 0 0;">
        如有任何疑問，請聯繫我們：<br>
        📞 台北：<strong style="color:#FAF6EE;">02-2331-8260</strong><br>
        📞 台中 &amp; 高雄：<strong style="color:#FAF6EE;">04-3506-5968</strong>
      </p>

    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#0A0700;padding:20px 40px;text-align:center;border-top:1px solid rgba(201,168,76,.15);">
      <p style="margin:0;color:rgba(250,246,238,.3);font-size:11px;line-height:2;letter-spacing:1px;">
        富豐企管顧問有限公司<br>
        此為系統自動發送，請勿直接回覆此信件
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  // Helper: build a table row
  function row(label, value) {
    return `<tr>
      <td style="padding:11px 22px;border-bottom:1px solid rgba(201,168,76,.08);
                 color:rgba(250,246,238,.5);font-size:12px;width:40%;vertical-align:top;">${label}</td>
      <td style="padding:11px 22px;border-bottom:1px solid rgba(201,168,76,.08);
                 color:#FAF6EE;font-size:14px;vertical-align:top;">${value}</td>
    </tr>`;
  }

  // ── Send via Resend ──────────────────────────────────────────
  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "富豐企管 <richfufong@gmail.com>",   // ← change to your verified Resend sender domain
        to: [email],
        subject: `【報名確認】四季贏家選股策略班｜訂單 ${order_no}`,
        html,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend error:", resendData);
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Email send failed", detail: resendData }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ success: true, email_id: resendData.id }),
    };
  } catch (err) {
    console.error("send-confirmation error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Failed to send email" }),
    };
  }
};
