// netlify/functions/kols-validate.js
// Route: GET /api/kols/validate/:code
const { Client } = require("pg");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const code = (event.queryStringParameters?.code || "").trim();
  console.log("kols-validate called, code:", code);

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

    // ILIKE = case-insensitive; is_active::text handles boolean or string 'true'
    const result = await client.query(
      `SELECT referral_code, username, is_active
       FROM kols
       WHERE referral_code ILIKE $1
         AND (is_active = true OR is_active::text = 'true')
       LIMIT 1`,
      [code]
    );
    console.log("DB result rows:", JSON.stringify(result.rows));

    if (result.rows.length === 0) {
      // Debug: check if code exists at all regardless of is_active
      const anyResult = await client.query(
        `SELECT referral_code, is_active FROM kols WHERE referral_code ILIKE $1 LIMIT 1`,
        [code]
      );
      console.log("Exists ignoring is_active?", JSON.stringify(anyResult.rows));

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ valid: false }),
      };
    }

    const kol = result.rows[0];
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ valid: true, referral_code: kol.referral_code, username: kol.username }),
    };
  } catch (err) {
    console.error("DB error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Database error", detail: err.message }),
    };
  } finally {
    await client.end();
  }
};
