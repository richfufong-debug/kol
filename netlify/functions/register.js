// netlify/functions/register.js
// Route: POST /api/register
const { Client } = require("pg");

function genOrderNo() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${date}-${rand}`;
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
    five_numbers_bank,   // ← new field
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

  // Validate five_numbers_bank for transfer payments
  if (payment === "transfer") {
    if (!five_numbers_bank || !/^\d{5}$/.test(five_numbers_bank)) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "請填寫正確的匯款帳號後五碼（5位數字）" }),
      };
    }
  }

  // Calculate price
  const basePrice = ticket_type === "kol" ? 4500 : 18000;
  const KOL_DISCOUNT = 4500;
  const discountAmount = referral_code ? KOL_DISCOUNT : 0;
  const finalPrice = Math.max(0, basePrice - discountAmount);

  const order_no = genOrderNo();

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // Verify referral code
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

    // Insert registration — now includes five_numbers_bank
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
        ticket_tier_id || (ticket_type === "kol" ? 1 : 2),
        quantity || 1,
        basePrice,
        discountAmount,
        finalPrice,
        payment === "transfer" ? five_numbers_bank : null,  // ← only save for transfer
      ]
    );

    // Increment KOL usage count
    if (validatedReferral) {
      await client.query(
        `UPDATE kols SET usage_count = COALESCE(usage_count, 0) + 1 WHERE referral_code = $1`,
        [validatedReferral]
      );
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
