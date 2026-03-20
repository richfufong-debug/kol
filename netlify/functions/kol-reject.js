// netlify/functions/kol-reject.js
// Route: GET /api/kol-reject?id=3&code=KOL003
// Admin clicks this link in email → KOL is rejected, code stays inactive
//
// Required env vars: DATABASE_URL
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

    // Keep is_active = false, just mark as rejected
    await client.query(
      `UPDATE kol_applications SET status = 'rejected' WHERE kol_id = $1`,
      [id]
    );

    // Optionally delete from kols so the code slot is freed
    await client.query(
      `DELETE FROM kols WHERE id = $1 AND referral_code = $2`,
      [id, code]
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: `
        <!DOCTYPE html>
        <html lang="zh-TW">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>KOL 申請已拒絕</title>
          <style>
            body{font-family:sans-serif;background:#0E0B05;color:#FAF6EE;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
            .box{text-align:center;padding:48px 40px;border:2px solid #C0392B;max-width:420px;}
            h2{color:#C0392B;font-size:24px;margin-bottom:12px;}
            .code{font-size:28px;font-weight:bold;color:#7A6E5F;letter-spacing:4px;margin:16px 0;text-decoration:line-through;}
            p{color:rgba(250,246,238,.6);font-size:14px;line-height:1.8;}
          </style>
        </head>
        <body>
          <div class="box">
            <div style="font-size:48px;">❌</div>
            <h2>申請已拒絕</h2>
            <div class="code">${code}</div>
            <p>該推薦碼已停用並從系統中移除<br>申請者將不會收到通知</p>
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
