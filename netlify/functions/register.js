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

  // ─── Pricing ──────────────────────────────────────────────────
  // solo → standard single ticket NT$9,800
  // kol  → KOL discounted ticket  NT$4,500 (~50% off)
  // basePrice is always 9,800 (the listed original price)
  const PRICE_SOLO     = 9800;
  const PRICE_KOL      = 4500;
  const basePrice      = PRICE_SOLO;
  const finalPrice     = ticket_type === "kol" ? PRICE_KOL : PRICE_SOLO;
  const discountAmount = basePrice - finalPrice; // 5300 for kol, 0 for solo
  // ─────────────────────────────────────────────────────────────

  const order_no = genOrderNo();

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // Verify referral code is valid if provided (kol ticket only)
    let validatedReferral = null;
    if (ticket_type === "kol" && referral_code) {
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
          payment_method, referral_code, ticket_type,
          base_price, discount_amount, final_price, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
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
