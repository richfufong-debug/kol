// netlify/functions/kol-apply.js
// Route: POST /api/kol-apply
// Flow:
//   1. Insert into kols with is_active = FALSE (pending approval)
//   2. Generate referral code KOL001, KOL002 ...
//   3. Save to kol_applications with status = 'pending'
//   4. Send approval email to admin via Resend
//   5. KOL sees "pending" message — code not active yet
//
// Required env vars:
//   DATABASE_URL      — Neon connection string
//   RESEND_API_KEY    — from resend.com
//   ADMIN_EMAIL       — your Gmail address to receive approvals
//   SITE_URL          — your Netlify site URL e.g. https://yoursite.netlify.app
const { Client } = require("pg");

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

  const { name, phone, email, platform, handle } = body;

  if (!name || !phone || !email || !platform || !handle) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "請完整填寫所有必填欄位" }),
    };
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // Step 1: Insert into kols — is_active = FALSE until approved
    const kolResult = await client.query(
      `INSERT INTO kols (username, referral_code, is_active, usage_count, created_at)
       VALUES ($1, 'TEMP', false, 0, NOW())
       RETURNING id`,
      [name.trim()]
    );
    const kolId = kolResult.rows[0].id;

    // Step 2: Generate referral code from id
    const referral_code = "KOL" + String(kolId).padStart(3, "0");

    // Step 3: Update kols with real code
    await client.query(
      `UPDATE kols SET referral_code = $1 WHERE id = $2`,
      [referral_code, kolId]
    );

    // Step 4: Save application as 'pending'
    await client.query(
      `INSERT INTO kol_applications
         (name, phone, email, platform, handle, referral_code, kol_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())`,
      [
        name.trim(),
        phone.trim(),
        email.trim().toLowerCase(),
        platform,
        handle.trim(),
        referral_code,
        kolId,
      ]
    );

    // Step 5: Send approval email to admin via Resend
    const siteUrl = process.env.SITE_URL || "";
    const approveUrl = `${siteUrl}/api/kol-approve?id=${kolId}&code=${referral_code}`;
    const rejectUrl  = `${siteUrl}/api/kol-reject?id=${kolId}&code=${referral_code}`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "KOL申請通知 <onboarding@resend.dev>",
        to: [process.env.ADMIN_EMAIL],
        subject: `【新KOL申請】${name} — ${referral_code}`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0E0B05;color:#FAF6EE;padding:32px;border:2px solid #C9A84C;">
            <h2 style="color:#C9A84C;margin-top:0;">新 KOL 推薦合作申請</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px 0;color:#7A6E5F;width:120px;">姓名</td><td style="padding:8px 0;">${name}</td></tr>
              <tr><td style="padding:8px 0;color:#7A6E5F;">電話</td><td style="padding:8px 0;">${phone}</td></tr>
              <tr><td style="padding:8px 0;color:#7A6E5F;">Email</td><td style="padding:8px 0;">${email}</td></tr>
              <tr><td style="padding:8px 0;color:#7A6E5F;">平台</td><td style="padding:8px 0;">${platform}</td></tr>
              <tr><td style="padding:8px 0;color:#7A6E5F;">帳號</td><td style="padding:8px 0;">@${handle}</td></tr>
              <tr><td style="padding:8px 0;color:#7A6E5F;">推薦碼</td><td style="padding:8px 0;font-weight:bold;color:#C9A84C;font-size:18px;">${referral_code}</td></tr>
            </table>
            <div style="margin-top:28px;display:flex;gap:12px;">
              <a href="${approveUrl}" style="display:inline-block;padding:14px 32px;background:#27AE60;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;margin-right:12px;">
                ✅ 核准申請
              </a>
              <a href="${rejectUrl}" style="display:inline-block;padding:14px 32px;background:#C0392B;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">
                ❌ 拒絕申請
              </a>
            </div>
            <p style="margin-top:24px;font-size:12px;color:#7A6E5F;">
              核准後推薦碼將立即生效，並顯示於報名頁面下拉選單中。
            </p>
          </div>
        `,
      }),
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        message: "申請已送出，審核通過後將通知您！",
        referral_code,
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
