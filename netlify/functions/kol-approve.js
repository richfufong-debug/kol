// netlify/functions/kol-approve.js
// Route: GET /api/kol-approve?id=3&code=KOL003
// Admin clicks this link in email → KOL is approved instantly
//
// Required env vars: DATABASE_URL, SITE_URL
const { Client } = require("pg");

exports.handler = async (event) => {
  const { id, code } = event.queryStringParameters || {};

  if (!id || !code) {
    return { statusCode: 400, body: "Missing id or code" };
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // Activate the KOL code — now shows in register.html dropdown
    await client.query(
      `UPDATE kols SET is_active = true WHERE id = $1 AND referral_code = $2`,
      [id, code]
    );

    // Update application status
    await client.query(
      `UPDATE kol_applications SET status = 'approved' WHERE kol_id = $1`,
      [id]
    );

    const siteUrl = process.env.SITE_URL || "";

    // Redirect admin to a confirmation page
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: `
        <!DOCTYPE html>
        <html lang="zh-TW">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>KOL 核准成功</title>
          <style>
            body{font-family:sans-serif;background:#0E0B05;color:#FAF6EE;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
            .box{text-align:center;padding:48px 40px;border:2px solid #27AE60;max-width:420px;}
            h2{color:#27AE60;font-size:24px;margin-bottom:12px;}
            .code{font-size:36px;font-weight:bold;color:#C9A84C;letter-spacing:6px;margin:20px 0;padding:12px 24px;border:1px solid #C9A84C;}
            p{color:rgba(250,246,238,.6);font-size:14px;line-height:1.8;}
            a{display:inline-block;margin-top:20px;padding:12px 24px;background:rgba(201,168,76,.15);border:1px solid #C9A84C;color:#C9A84C;text-decoration:none;font-size:13px;}
          </style>
        </head>
        <body>
          <div class="box">
            <div style="font-size:48px;">✅</div>
            <h2>核准成功！</h2>
            <div class="code">${code}</div>
            <p>推薦碼已啟用<br>現已顯示於報名頁面下拉選單中</p>
            <a href="${siteUrl}/register.html">← 前往報名頁確認</a>
          </div>
        </body>
        </html>
      `,
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Database error" };
  } finally {
    await client.end();
  }
};
