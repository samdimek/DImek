# xamdimek.xyz — portfolio + Stripe store

A real, working payment site: portfolio front-end plus serverless functions that
take **real card payments** through Stripe. When someone checks out, Stripe charges
their card and the money lands in your US Stripe balance → your US bank.

Everything below runs on **free tiers** — no monthly bills.

| Piece | Service | Cost |
|------|---------|------|
| Hosting + serverless API + custom domain | **Vercel** (Hobby) | Free |
| Payments (cards, 3-D Secure, subscriptions) | **Stripe** | No monthly fee; ~2.9% + 30¢ per successful charge |
| Auto-email buyers their files *(optional)* | **Resend** (free tier) | Free up to 100 emails/day |
| Database | — none needed | Stripe is the source of truth |

## What it does
- One-time products: journals, recordings, art, lessons, courses (incl. Flashloans).
- A **monthly subscription** (Trading Bot, $25/mo) with its own Subscribe button.
- **Visa & Mastercard**, with **3-D Secure (3D)** applied automatically when the
  card issuer or EU/Netherlands SCA rules require it, and plain **2D** otherwise.
- Cart, quantities, hosted Stripe checkout, receipts, and a verified webhook for fulfilment.

---

## Files
```
index.html                      the site + store (front-end)
api/create-checkout-session.js  makes a Stripe Checkout Session (cart + subscription)
api/webhook.js                  verified fulfilment after payment
package.json  .env.example      config
```

---

## Setup (about 20 minutes)

### 1. Create your products in Stripe
In the Stripe Dashboard → **Products**, create one product per item and copy each
**Price ID** (`price_...`). Set the Trading Bot's price to **Recurring · Monthly**;
all others are **One-time**. There are 9 in total (see `.env.example`).

### 2. Deploy to Vercel
1. Put this folder in a GitHub repo.
2. On [vercel.com](https://vercel.com) → **New Project** → import the repo → **Deploy**.
   Vercel serves `index.html` at `/` and each file in `/api` as a function automatically.

### 3. Add environment variables
In Vercel → your project → **Settings → Environment Variables**, add everything from
`.env.example`:
- `STRIPE_SECRET_KEY` — from Stripe → Developers → API keys (use `sk_test_…` first).
- the nine `PRICE_…` IDs from step 1.
- `STRIPE_WEBHOOK_SECRET` — added in step 5.
- optional `RESEND_API_KEY` / `FROM_EMAIL`.

Redeploy after adding them.

### 4. Point the domain
Vercel → **Settings → Domains** → add `www.xamdimek.xyz` (and `xamdimek.xyz`), then set
the DNS records Vercel shows you at your registrar. The return URLs are built from the
live domain automatically.

### 5. Add the webhook
Stripe → **Developers → Webhooks → Add endpoint**:
- URL: `https://www.xamdimek.xyz/api/webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.deleted`.
Copy the **Signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET` and redeploy.

### 6. Test it (this is the "let friends test" part)
Keep Stripe in **test mode** and use test cards at checkout:
- **2D success:** `4242 4242 4242 4242`
- **3-D Secure challenge:** `4000 0027 6000 3184`
- **Mastercard:** `5555 5555 5555 4444`
Any future expiry, any CVC, any ZIP. No real money moves. The cart shows these hints
while `TEST_MODE` is `true` (top of the `<script>` in `index.html`).

### 7. Go live
Swap the Stripe keys for `sk_live_…`, recreate the webhook in live mode, set the live
`PRICE_…` IDs, and set `CONFIG.TEST_MODE = false` in `index.html`.

---

## Fulfilment (delivering the goods)
`api/webhook.js` is where a paid order becomes a delivered order. Fill the `DELIVERY`
map with links to the files you host (Vercel static, a public bucket, a Drive share…).
If you set `RESEND_API_KEY`, buyers get an automatic email with their links; either way
Stripe emails them a receipt. For the mentorship/subscription, you'll follow up manually
or wire it to a calendar tool.

## A note on tax (US + Netherlands)
With your own Stripe account **you are the merchant of record**, so you're responsible
for sales tax / EU VAT where it applies — the Netherlands is in the EU, so VAT can apply
to digital sales there. The easy path is to turn on **Stripe Tax** (Settings → Tax) and
add `automatic_tax: { enabled: true }` to the session in `create-checkout-session.js`.
If you'd rather offload tax entirely, a merchant-of-record (Paddle / Lemon Squeezy) can
be the seller and remit tax for you — happy to wire that variant instead.

## Other hosts
Prefer Netlify or Cloudflare? The front-end is identical; only the function wrapper
changes (Netlify: `netlify/functions/…` with `handler(event)`; Cloudflare Pages:
`functions/api/…` with `onRequestPost`). Ask and I'll port `api/` over.
