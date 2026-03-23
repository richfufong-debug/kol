// netlify/functions/create-payment.js
// Route: POST /api/create-payment
//
// Called after /api/register succeeds (credit card only).
// Generates a NewebPay AES+SHA256 signed payment form and returns
// the action URL + hidden fields so the browser can POST directly to NewebPay.
//
// Required env vars:
//   NEWEBPAY_MERCHANT_ID   — your merchant ID e.g. MS3386778646
//   NEWEBPAY_HASH_KEY      — from NewebPay dashboard
//   NEWEBPAY_HASH_IV       — from NewebPay dashboard
//   SITE_URL               — e.g. https://yoursite.netlify.app

const crypto = require("crypto");

function aesEncrypt(data, key, iv) {
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function sha256Sign(tradeInfo, key, iv) {
  const str = `HashKey=${key}&${tradeInfo}&HashIV=${iv}`;
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
      body: JSON.stringify({ error: "Missing required fields" }),
    };
  }

  const merchantId = process.env.NEWEBPAY_MERCHANT_ID;
  const hashKey   = process.env.NEWEBPAY_HASH_KEY;
  const hashIv    = process.env.NEWEBPAY_HASH_IV;
  const siteUrl   = process.env.SITE_URL || "";

  // Build TradeInfo query string
  const tradeParams = new URLSearchParams({
    MerchantID:      merchantId,
    RespondType:     "JSON",
    TimeStamp:       Math.floor(Date.now() / 1000).toString(),
    TransAmt:        String(amount),
    MerchantOrderNo: order_no,          // ← this comes back in webhook
    ItemDesc:        description || "杜金龍四季贏家選股策略班",
    Email:           email,
    LoginType:       "0",
    NotifyURL:       `${siteUrl}/api/payment-callback`,  // webhook (background)
    ReturnURL:       `${siteUrl}/payment-return.html`,   // browser redirect after payment
    ClientBackURL:   `${siteUrl}/register.html`,
    CREDIT:          "1",               // enable credit card
  }).toString();

  const tradeInfo = aesEncrypt(tradeParams, hashKey, hashIv);
  const tradeSha  = sha256Sign(tradeInfo, hashKey, hashIv);

  // NewebPay production endpoint
  // For testing use: https://ccore.newebpay.com/MPG/mpg_gateway
  const actionUrl = "https://core.newebpay.com/MPG/mpg_gateway";

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      action:      actionUrl,
      MerchantID:  merchantId,
      TradeInfo:   tradeInfo,
      TradeSha:    tradeSha,
      Version:     "2.0",
    }),
  };
};
