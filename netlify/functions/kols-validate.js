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
  // Do NOT uppercase — codes like "Realname448" are mixed-case in the DB
  const code = (event.queryStringParameters?.code || "").trim();

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
    // ILIKE = case-insensitive match so "kol009" matches "KOL009", etc.
    const result = await client.query(
      `SELECT referral_code, username
       FROM kols
       WHERE referral_code ILIKE $1 AND is_active = true
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

    const kol = result.rows[0];
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      // Return canonical referral_code from DB so frontend always stores the correct casing
      body: JSON.stringify({ valid: true, referral_code: kol.referral_code, username: kol.username }),
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
