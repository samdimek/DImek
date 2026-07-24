// api/create-checkout-session.js
// Runs on Vercel (free Hobby plan). Creates a Stripe Checkout Session and
// returns its URL. The secret key NEVER leaves the server. Stripe's hosted
// checkout handles the card form, 3-D Secure (3D) and plain 2D charges,
// subscriptions, and emailed receipts.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ---------------------------------------------------------------------------
// SERVER-AUTHORITATIVE PRICE MAP
// Create each product/price once in your Stripe Dashboard, then paste the
// resulting Price IDs (price_...) into your environment variables.
// The browser only sends product ids + quantities — never amounts — so a
// visitor can't tamper with what they pay.
// ---------------------------------------------------------------------------
const PRICES = {
  jrnl: process.env.PRICE_JRNL, // The Voltage Trading Journal          $15  one-time
  rec1: process.env.PRICE_REC1, // Live Trading Session Recordings      $20  one-time
  rec2: process.env.PRICE_REC2, // Smart-Contract Audit Screencasts     $30  one-time
  art1: process.env.PRICE_ART1, // On-Chain Generative Prints           $40  one-time
  les1: process.env.PRICE_LES1, // 1:1 Solidity Mentorship (60 min)     $50  one-time
  crs1: process.env.PRICE_CRS1, // EVM Mastery — Full Course            $95  one-time
  crs2: process.env.PRICE_CRS2, // Flashloans course                    $120 one-time
  bot:  process.env.PRICE_BOT,  // Trading Bot — Monthly Access         $25  RECURRING
  bid:  process.env.PRICE_BID,  // Writing Bidding Bots                 $15  one-time
};

// ids whose Stripe price is recurring → the session must be mode:subscription
const RECURRING = new Set(["bot"]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Stripe secret key not configured on the server" });
  }

  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Your cart is empty" });
    }

    const line_items = items.map((it) => {
      const price = PRICES[it.id];
      if (!price) throw new Error(`Unknown or unconfigured item: ${it.id}`);
      const quantity = Math.max(1, Math.min(99, parseInt(it.quantity, 10) || 1));
      return { price, quantity };
    });

    const hasRecurring = items.some((it) => RECURRING.has(it.id));
    const mode = hasRecurring ? "subscription" : "payment";

    // Build absolute return URLs from the request origin (falls back to prod domain)
    const origin =
      req.headers.origin ||
      (req.headers.host ? `https://${req.headers.host}` : "https://www.xamdimek.xyz");

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items,
      payment_method_types: ["card"], // Visa, Mastercard, Amex, etc.
      billing_address_collection: "auto",
      // Collect the buyer's email so receipts + fulfillment can be sent
      customer_creation: mode === "payment" ? "always" : undefined,
      // 3-D Secure: "automatic" lets Stripe apply 3DS when the issuer or EU
      // SCA rules require it, and process plain 2D otherwise.
      payment_method_options:
        mode === "payment" ? { card: { request_three_d_secure: "automatic" } } : undefined,
      allow_promotion_codes: true,
      success_url: `${origin}/?checkout=success&sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return res.status(500).json({ error: err.message || "Could not start checkout" });
  }
}
