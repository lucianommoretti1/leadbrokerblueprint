# Lead Broker Blueprint — Deployment & Activation Guide

This is everything you need to take the site live: hosting setup, domain registration, waitlist activation, then (when you're ready) Stripe + magic-link auth for the members area.

The site is designed around a **launch-as-waitlist first, then flip to live sales** flow. You can go live in waitlist mode in about 30 minutes; the full activation to sales is a 2–3 hour project once you've made a few external accounts.

---

## What you have

```
Website/
├── index.html              Main long-scroll sales page (public)
├── privacy.html            Privacy notice (CCPA/CPRA-aware)
├── terms.html              Terms of Service
├── refund.html             Refund Policy (real 30-day)
├── contact.html            Contact page
├── thank-you.html          Post-waitlist signup confirmation
├── assets/
│   ├── styles.css          Shared stylesheet (bright/modern/upbeat)
│   ├── main.js             Scroll reveal + waitlist form handler
│   └── img/                (placeholder for any images)
├── members/                Gated members area (eight module pages + dashboard + login)
│   ├── login.html
│   ├── dashboard.html
│   └── module-1.html ... module-8.html
└── functions/              Serverless function stubs for Cloudflare Pages / Netlify
    ├── waitlist.js
    ├── stripe-webhook.js
    ├── request-magic-link.js
    └── verify-magic-link.js
```

The members-area pages reference the existing course PDFs from sibling folders (`../Module 1 - .../`, etc.) — so they work as long as the whole `Lead Broker` folder is deployed together.

---

## Phase 1 — Launch in waitlist mode (≈30 minutes)

Goal: site is live at a domain you own; visitors can browse and join the waitlist. Members area pages exist but the login is honestly disabled until launch.

### Step 1.1 — Pick a host (free tier)

Recommended: **Cloudflare Pages** (free, fast, includes Functions and KV storage on the free tier). Alternative: **Netlify** (free tier with Functions, similar mechanics).

The instructions below use Cloudflare Pages. Netlify is similar; differences flagged where relevant.

### Step 1.2 — Get the site into Git

Sign up at github.com (free). Create a private repo named `leadbrokerblueprint`. Push the `Website/` folder contents into the repo root.

Easiest way if you don't use Git: install GitHub Desktop (desktop.github.com), drag the folder in, commit, push.

### Step 1.3 — Connect to Cloudflare Pages

1. Sign up at cloudflare.com if you haven't.
2. Pages → Create a project → Connect to Git → choose your repo.
3. Build settings:
   - Framework preset: **None** (it's static HTML)
   - Build command: leave empty
   - Build output directory: `/`
4. Click Save and Deploy. You'll get a URL like `https://leadbrokerblueprint.pages.dev`.

Open the URL — the site is live.

### Step 1.4 — Register the domain

If you want a real domain (e.g., `leadbrokerblueprint.com`):

1. Register at **Cloudflare Registrar** (at-cost pricing, ~$10/yr for `.com`). Sign up if you haven't.
2. In Cloudflare Pages → Custom domains → Add `leadbrokerblueprint.com` (and the `www` variant).
3. Cloudflare will configure DNS automatically since the domain is registered with them.

SSL is automatic with Cloudflare; the site will be HTTPS within a few minutes.

### Step 1.5 — Wire the waitlist form to your inbox

The site's waitlist form posts to `/api/waitlist`. The serverless function in `functions/waitlist.js` either:

- Logs the signup (if no email provider configured), OR
- Forwards the signup to `leadbrokerblueprint@gmail.com` via Resend if `RESEND_API_KEY` is set.

To activate the Resend forwarding:

1. Sign up at **resend.com** (free tier: 3,000 emails/month — more than enough).
2. Verify a sending domain. Easiest: add the DNS records Resend gives you to your Cloudflare DNS (takes ~5 minutes).
3. In Resend → API Keys, create a new API key. Copy it.
4. In Cloudflare Pages → Settings → Environment variables, add:
   - `RESEND_API_KEY` = the key from step 3
   - `NOTIFICATION_EMAIL` = `leadbrokerblueprint@gmail.com`
5. Redeploy (Pages does this automatically on the next push, or trigger manually).

Test by submitting your own email through the form. You should receive the notification at your Gmail within a few seconds.

**Until you complete this:** waitlist signups are logged to Cloudflare's function logs (visible in the Pages dashboard). You won't lose them, but you have to check the logs manually.

### Step 1.6 — That's it for waitlist mode

The site is live; the waitlist works; visitors see a polished marketing page; the members area exists but its login is honestly disabled with a clear "activates at launch" message.

You can announce the URL on Reddit, X, LinkedIn, IndieHackers, Hacker News (Show HN), etc. Per the course's marketing rules: no fake urgency, no fake testimonials, no income claims.

---

## Phase 2 — Activate the members area (≈2–3 hours)

Goal: members can log in and access the course; you can sell the course via Stripe and grant access automatically.

### Step 2.1 — Create Stripe products

1. Sign up at **stripe.com**.
2. Activate your account (provide business details, bank info for payouts).
3. Products → Create three products:
   - "Lead Broker Blueprint" — $297, one-time price
   - "Lead Broker Blueprint + Add Ons" — $1,297, one-time price
   - "Lead Broker Blueprint + Mentorship" — $2,997, one-time price
4. For each product, create a **Payment Link** (Stripe → Payment Links). This is the easiest way to take payment without writing a custom checkout page.
5. Copy each payment link URL.
6. In `index.html`, replace the `href="#waitlist"` on each `.price-card`'s CTA button with the corresponding Stripe Payment Link URL. (At launch — leave as waitlist for now.)

### Step 2.2 — Set up Resend for transactional email (if not already)

You did this in Phase 1.5 for waitlist forwarding. The same Resend account also sends magic-link login emails. No additional setup needed — but make sure you've verified a sending domain (otherwise emails go to spam).

### Step 2.3 — Create the KV stores for the members area

Cloudflare Pages → Functions → KV namespace bindings:

1. Workers & Pages → KV → Create namespace → name it `BUYERS`. Copy the namespace ID.
2. Create another namespace named `TOKENS`. Copy the ID.
3. Back in your Pages project → Settings → Functions → KV bindings:
   - Add binding `BUYERS` → select the BUYERS namespace
   - Add binding `TOKENS` → select the TOKENS namespace
4. Settings → Environment variables, add:
   - `AUTH_SECRET` = a 32+ character random string (generate with `openssl rand -base64 32`)

Redeploy.

### Step 2.4 — Configure the Stripe webhook

1. Stripe Dashboard → Developers → Webhooks → Add endpoint.
2. URL: `https://leadbrokerblueprint.com/api/stripe-webhook`
3. Events to listen to:
   - `checkout.session.completed`
   - `charge.refunded`
4. Copy the webhook signing secret.
5. In Pages → Environment variables, add:
   - `STRIPE_WEBHOOK_SECRET` = the value from step 4
   - `STRIPE_SECRET_KEY` = your Stripe secret key (Developers → API keys; use the **live** key, not the test key, when going live)
6. Open `functions/stripe-webhook.js` and (a) replace the TODO around signature verification with actual code using the Stripe Node SDK or Web Crypto API (the file has comments where), and (b) implement `mapPriceIdToTier` to translate Stripe price IDs to the three tier names (look up your price IDs in the Stripe Dashboard).
7. Test the webhook by triggering a test event from Stripe Dashboard.

### Step 2.5 — Flip the buy buttons live

Once Stripe products exist and the webhook works:

1. In `index.html`, change the three pricing-tier CTAs from `href="#waitlist"` to the actual Stripe Payment Link URLs (or to a hosted Stripe Checkout session if you'd rather).
2. Update the hero CTAs ("Join the waitlist →") to "Buy now →" linking to your most-popular tier, or keep them pointing to the pricing section.
3. Optionally update the FAQ + waitlist section to reflect that the course is now buyable. The waitlist form can stay — it remains useful for capturing leads who don't buy on first visit.
4. Push the change to your repo; Cloudflare auto-deploys.

### Step 2.6 — Announce launch to the waitlist

Send the launch email to everyone on the waitlist. Suggest a founding-member discount (e.g., 20% off for the first 100 buyers, valid for 7 days), set the deadline clearly in the email, and honor it. Per the course's rules: no fake urgency.

---

## Phase 3 — Operational follow-through (ongoing)

### Quarterly regulatory updates

Module 3 (the regulatory module) and the Compliance Checklist are committed to quarterly refreshes. Each quarter:

1. Re-research the regulations using the law-firm-published TCPA / FTC update feeds (Klein Moynihan Turco, Eversheds Sutherland, Squire Patton Boggs, Manatt).
2. Update the relevant build scripts in the curriculum source folder (`outputs/build_module3_*.js`, `outputs/build_module3_checklist.js`).
3. Re-run the build scripts to regenerate the affected PDFs.
4. Replace the PDFs in the `Module 3 - The Regulatory Landscape/` folder.
5. Notify buyers via email (one quarterly-update email).

### Video lessons

The members-area module pages have placeholders for video. To record:

1. Use the "On-camera summary" anchors in each lesson as your spoken-word script (every lesson has one).
2. Record talking-head + slides (Keynote / Google Slides) on Loom, Riverside.fm, or a phone + lavalier mic.
3. Upload to Vimeo Pro (privacy-locked to your domain only).
4. Replace the video placeholder block in each `members/module-N.html` with the Vimeo embed iframe.

### Maintaining the four marketing rules

Once a quarter, audit the site against the four rules:

1. **No income claims** — search the site for any number-of-dollars-per-month language; reject.
2. **No fake reviews** — testimonials only when real students leave them; clear material-connection disclosure (Module 3.6).
3. **No fake urgency** — countdown timers, "only X spots" banners, fake scarcity all stay off.
4. **Real 30-day refund** — process refunds without friction; the Refund Policy stays exactly as written.

---

## Costs at small scale (May 2026 estimates)

| Item                                   | Cost           |
|----------------------------------------|----------------|
| Cloudflare Pages hosting               | Free           |
| Cloudflare KV storage                  | Free (within free tier)  |
| Cloudflare Registrar (`.com`)          | ~$10/yr        |
| Resend transactional email             | Free up to 3k/month, then $20/month |
| Stripe (transaction fees only)         | 2.9% + 30¢ per sale |
| Vimeo Pro (video hosting, post-launch) | ~$240/yr       |
| Domain email (Google Workspace optional)| ~$6/mo         |

**Subtotal monthly fixed costs (early days): roughly $30–60/month**, vs. $40–$300/month for course platforms with comparable functionality, plus their 5–15% transaction take.

---

## Troubleshooting

- **Waitlist form returns an error.** Check Cloudflare Pages → Functions → Logs. Most common cause: `RESEND_API_KEY` env var missing or Resend domain not yet verified.
- **Buy button does nothing.** Verify the Stripe Payment Link URL is set correctly on each `.price-card` CTA.
- **Magic-link email doesn't arrive.** Resend sender domain not verified (your DNS records aren't fully propagated yet — wait 5–30 min). Check Resend → Logs.
- **Member can't log in after purchase.** The Stripe webhook may not have authorized them. Check Cloudflare Pages logs for the webhook handler; also check the BUYERS KV namespace to see if their email is in it. Add manually if needed via the KV dashboard.
- **404 on a module deliverable PDF.** The module folder must be deployed alongside the Website folder, OR the deliverables need to live inside the `Website/` folder. The simplest fix: copy the whole `Lead Broker/` directory (including module folders) into the deployment, OR move just the PDF files into `Website/members/deliverables/` and update the paths in `build_module_pages.js`.

---

## Honest notes from the build

- **Pre-launch members area is intentionally disabled.** The `/members/login.html` page returns a clear "Members area activates at launch" message if backing services aren't configured. This is honest, not broken. Activate the magic-link auth when you're ready to sell.
- **Stripe webhook signature verification is left as a TODO.** It's a 10–20 line addition once you choose between the Node Stripe SDK and a manual Web Crypto HMAC verification. The webhook is functional but unsigned-request-tolerant until you finish it. **Don't go live with real money until that's done.**
- **You don't have testimonials.** The FAQ on the site acknowledges this honestly. Don't fabricate them. Real student feedback can replace the "Why isn't there a testimonial section?" FAQ once you have real students.
- **Counsel review.** Before going live with paid sales at $297–$2,997 price points, have an attorney licensed in your state of operation review (at minimum) the Terms of Service, the Privacy Notice, and the Refund Policy. The drafts here are starting language consistent with the course's own teachings, not finished legal documents.
- **Tax / VAT.** Stripe collects payment cleanly, but you are responsible for sales tax / VAT compliance in jurisdictions that require it. For US-only sales, this is generally manageable; for international sales, consider using Stripe Tax (paid add-on) or a merchant-of-record alternative (Paddle, Lemon Squeezy) when you're ready.

---

## Quick links

- Cloudflare Pages: https://pages.cloudflare.com
- Resend: https://resend.com
- Stripe: https://stripe.com
- Vimeo Pro: https://vimeo.com/upgrade
- Cloudflare Registrar: https://www.cloudflare.com/products/registrar/

Maintained by Luciano Moretti. Questions: leadbrokerblueprint@gmail.com.
