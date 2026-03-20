// netlify/functions/kols-validate.js
// Route: GET /api/kols/validate/:code
// Netlify maps this via netlify.toml redirect:
//   /api/kols/validate/:code  →  /.netlify/functions/kols-validate?code=:code
const { Client } = require("pg");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Code comes from query string (set by netlify.toml redirect)
  const code = (event.queryStringParameters?.code || "").trim().toUpperCase();

  if (!code) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ valid: false, error: "Missing code" }),
    };
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const result = await client.query(
      `SELECT referral_code, username
       FROM kols
       WHERE referral_code = $1 AND is_active = true
       LIMIT 1`,
      [code]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ valid: false }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ valid: true, kol: result.rows[0] }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Database error" }),
    };
  } finally {
    await client.end();
  }
};
