// api/webhook.js
// Stripe calls this after a payment. It's the ONLY trustworthy signal that
// money actually cleared (the browser redirect can be faked or interrupted).
// Here you fulfil the order: email the buyer their files / access.
//
// Raw body is required for signature verification, so Vercel's body parser
// is disabled for this route below.

import Stripe from "stripe";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Optional: map product/price -> the download link or access note you email.
// Fill these with links to files you host for free (e.g. Vercel static,
// a public bucket, a Google Drive share, etc.).
const DELIVERY = {
  // price_xxx: "https://www.xamdimek.xyz/files/trading-journal.pdf",
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(Buffer.from(data)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method not allowed");
  }

  let event;
  try {
    const raw = await readRawBody(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const email = session.customer_details?.email;

      // Expand the line items to know what was bought
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 50 });
      const links = lineItems.data
        .map((li) => DELIVERY[li.price?.id])
        .filter(Boolean);

      console.log(`✅ Paid: ${email} — ${lineItems.data.map((l) => l.description).join(", ")}`);

      // Optional auto-fulfilment email via Resend (free tier).
      // Set RESEND_API_KEY to enable; otherwise Stripe's own receipt still sends.
      if (process.env.RESEND_API_KEY && email) {
        const body = links.length
          ? `Thank you for your purchase!\n\nYour downloads:\n${links.join("\n")}`
          : `Thank you for your purchase! I'll follow up shortly with your files or access.`;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.FROM_EMAIL || "Samuel Mwadime <onboarding@resend.dev>",
            to: email,
            subject: "Your order from xamdimek.xyz",
            text: body,
          }),
        }).catch((e) => console.error("Resend error:", e));
      }
    }

    if (event.type === "customer.subscription.created") {
      console.log("🔁 New subscription:", event.data.object.id);
    }
    if (event.type === "customer.subscription.deleted") {
      console.log("⏹️ Subscription cancelled:", event.data.object.id);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
