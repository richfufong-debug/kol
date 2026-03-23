// netlify/functions/create-payment.js
// Route: POST /api/create-payment
// Builds and signs the NewebPay MPG TradeInfo payload
//
// Required env vars:
//   NEWEBPAY_MERCHANT_ID   — MS3386778646
//   NEWEBPAY_HASH_KEY      — from NewebPay dashboard
//   NEWEBPAY_HASH_IV       — from NewebPay dashboard
//   SITE_URL               — e.g. https://yoursite.netlify.app
//   NEWEBPAY_ENV           — "production" | "sandbox" (default sandbox)

const crypto = require("crypto");

// NewebPay endpoints
const GATEWAY = {
  production: "https://core.newebpay.com/MPG/mpg_gateway",
  sandbox:    "https://ccore.newebpay.com/MPG/mpg_gateway",
};

// AES-256-CBC encrypt → hex string
function aesEncrypt(data, key, iv) {
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv,  "utf8")
  );
  return cipher.update(data, "utf8", "hex") + cipher.final("hex");
}

// SHA256 hash for TradeSha
function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex").toUpperCase();
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

  const { order_no, amount, name, email, description } = body;

  if (!order_no || !amount || !name || !email) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Missing required payment fields" }),
    };
  }

  // Ensure amount is a positive integer (NewebPay requires no decimals)
  const amt = parseInt(amount, 10);
  if (!amt || amt <= 0) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid amount" }),
    };
  }

  const MERCHANT_ID = process.env.NEWEBPAY_MERCHANT_ID || "MS3386778646";
  const HASH_KEY    = process.env.NEWEBPAY_HASH_KEY;
  const HASH_IV     = process.env.NEWEBPAY_HASH_IV;
  const SITE_URL    = process.env.SITE_URL || "";
  const ENV         = process.env.NEWEBPAY_ENV === "production" ? "production" : "sandbox";

  if (!HASH_KEY || !HASH_IV) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Payment gateway not configured" }),
    };
  }

  // Build TradeInfo query string
  const tradeParams = new URLSearchParams({
    MerchantID:      MERCHANT_ID,
    RespondType:     "JSON",
    TimeStamp:       Math.floor(Date.now() / 1000).toString(),
    Version:         "2.0",               // ← must be exactly "2.0"
    MerchantOrderNo: order_no,
    Amt:             amt.toString(),       // integer, no NT$ symbol
    ItemDesc:        description || "杜金龍四季贏家選股策略班",
    Email:           email,
    LoginType:       "0",
    ReturnURL:       `${SITE_URL}/payment-result.html`,
    NotifyURL:       `${SITE_URL}/api/payment-callback`,
    ClientBackURL:   `${SITE_URL}/register.html`,
  });

  const tradeInfoStr = tradeParams.toString();

  // AES encrypt
  const TradeInfo = aesEncrypt(tradeInfoStr, HASH_KEY, HASH_IV);

  // SHA256 hash
  const TradeSha = sha256(
    `HashKey=${HASH_KEY}&TradeInfo=${TradeInfo}&HashIV=${HASH_IV}`
  );

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      action:     GATEWAY[ENV],
      MerchantID: MERCHANT_ID,
      TradeInfo,
      TradeSha,
      Version:    "2.0",
    }),
  };
};
