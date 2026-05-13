# Lead Broker Blueprint — website

The marketing site and members area for **Lead Broker Blueprint by Luciano Moretti**.

A self-hosted, single-long-scroll sales page plus a gated members area with eight module pages. Bright, modern, upbeat aesthetic. Self-contained HTML/CSS/JS — no build step.

## Quick start

1. Read **DEPLOYMENT.md** for the full deployment guide.
2. Phase 1 (≈30 min) gets you live in waitlist mode.
3. Phase 2 (≈2–3 hrs) activates Stripe + magic-link auth for direct sales.

## What's here

- `index.html` — main long-scroll sales page (public)
- `privacy.html`, `terms.html`, `refund.html`, `contact.html`, `thank-you.html` — compliance / utility pages
- `assets/` — shared CSS + JS + image folder
- `members/` — gated members area (8 module pages + dashboard + magic-link login)
- `functions/` — serverless function stubs (waitlist, Stripe webhook, magic-link auth)
- `DEPLOYMENT.md` — step-by-step deployment + activation guide

## Tech stack

- Static HTML/CSS/JS — host anywhere
- Designed for Cloudflare Pages (free tier) or Netlify
- Cloudflare KV (or Netlify Blobs) for buyer-authorization storage
- Stripe for payments
- Resend for transactional email (magic-link login, waitlist notifications)
- Vimeo Pro for video hosting (post-launch)

## The four marketing rules

The site is built to honor the four rules baked into the course curriculum:

1. No income claims.
2. No fake reviews or AI-generated testimonials (FTC Reviews Rule, Oct 21 2024).
3. No fake urgency, fake countdowns, or manufactured scarcity.
4. Real 30-day refund policy, no friction.

If you modify the site, please keep these rules intact. They are the spine of the brand.

## Contact

leadbrokerblueprint@gmail.com
