// /api/stripe/webhook — Stripe webhook handler with welcome-email automation.
//
// On checkout.session.completed:
//   1. Verify the Stripe signature.
//   2. Look up amount_total to determine tier.
//   3. Write the buyer record to BUYERS KV (activates members area access).
//   4. Send a welcome email via Resend with the login link + first-week reading order.
//
// On charge.refunded:
//   1. Verify signature.
//   2. Remove the buyer email from BUYERS KV (revokes members area access).
//
// Required bindings/secrets:
//   STRIPE_WEBHOOK_SECRET   — Stripe Dashboard → Webhooks → endpoint → Signing secret
//   RESEND_API_KEY          — Resend API key (sending access on leadbrokerblueprint.us)
//   BUYERS                  — KV namespace binding (defined in wrangler.jsonc)

const TIER_BY_AMOUNT = {
  69700: { id: "blueprint", name: "Blueprint", price: "$697" },
  269700: { id: "blueprint_community", name: "Blueprint + Community", price: "$2,697" },
  489700: { id: "blueprint_mentorship", name: "Blueprint + Mentorship", price: "$4,897" },
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Webhook backend not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature") || "";
  if (!signature) return new Response("Missing signature", { status: 400 });

  const rawBody = await request.text();

  const verified = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) return new Response("Invalid signature", { status: 401 });

  let event;
  try { event = JSON.parse(rawBody); }
  catch (e) { return new Response("Invalid JSON", { status: 400 }); }

  // ─── checkout.session.completed ───────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = (session.customer_details && session.customer_details.email) || session.customer_email;
    const firstName = extractFirstName(session.customer_details && session.customer_details.name);

    if (!email) {
      return new Response(JSON.stringify({ error: "No email on session" }), { status: 400 });
    }

    const tier = TIER_BY_AMOUNT[session.amount_total] || { id: "unknown", name: "Unknown tier", price: "" };

    // Activate buyer in BUYERS KV
    if (env.BUYERS) {
      await env.BUYERS.put(
        email.toLowerCase(),
        JSON.stringify({
          email,
          firstName,
          tier: tier.id,
          tierName: tier.name,
          amount: session.amount_total,
          purchasedAt: new Date().toISOString(),
          stripeSessionId: session.id,
        })
      );
    }

    // Send welcome email via Resend
    if (env.RESEND_API_KEY) {
      try {
        await sendWelcomeEmail(env.RESEND_API_KEY, email, firstName, tier);
      } catch (e) {
        // Don't fail the webhook if email send fails — the buyer is still activated in KV.
        console.warn("Welcome email send failed:", String(e));
      }
    }

    return new Response(JSON.stringify({ ok: true, authorized: email, tier: tier.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ─── charge.refunded ──────────────────────────────────────────
  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const email = charge.billing_details && charge.billing_details.email;
    if (email && env.BUYERS) {
      await env.BUYERS.delete(email.toLowerCase());
    }
    return new Response(JSON.stringify({ ok: true, revoked: email || null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, ignored: event.type }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Welcome email composer ───────────────────────────────────
async function sendWelcomeEmail(apiKey, email, firstName, tier) {
  const greeting = firstName ? `Hi ${firstName},` : `Hi,`;
  const loginUrl = "https://leadbrokerblueprint.us/members/login.html";

  const text = [
    greeting,
    "",
    `Welcome to the Lead Broker Blueprint — your ${tier.name} purchase is confirmed.`,
    "",
    "▸ Log in to your members area: " + loginUrl,
    "",
    "When you click that link, enter the email address you used at purchase. Within ~10 seconds you'll receive a one-time login link from this same address. The link works once, expires in 15 minutes, and you can always request a fresh one.",
    "",
    "─── YOUR FIRST WEEK ───",
    "",
    "The Blueprint is built to be read in sequence. Here's what I'd recommend for your first seven days:",
    "",
    "Day 1-2 — Module 1: What Lead Brokering Actually Is (vocabulary + four-player ecosystem). 30 min read.",
    "Day 3 — Module 2: The Vertical Landscape. Use the Niche Evaluation Worksheet to narrow to 1-2 verticals before reading further. This decision drives everything downstream.",
    "Day 4-5 — Module 3: The Regulatory Landscape. The most important compliance reading you'll do. Skip nothing here.",
    "Day 6 — Module 4 + the Landing Your First Buyer Relationships playbook. 24 pages on outreach, pitch, negotiation. Start outreach work this week.",
    "Day 7 — Module 5 + the Cold-to-Warm Conversion Playbook (30 pp) + Modern & Emerging Channels (32 pp). The two most-recommended deliverables in the entire Blueprint.",
    "",
    "─── REFUND POLICY ───",
    "",
    "Your 30-day refund period started today. If at any point you decide the Blueprint isn't right for you, just reply to this email with the word \"refund\" and I'll process it within 5 business days. No questions, no win-back, no friction.",
    "",
    "─── WHAT TO EXPECT FROM ME ───",
    "",
    "Quarterly regulatory-update emails (every 90 days, only when something material changes). Announcements when new video content drops. Nothing else. No drip sequences, no daily content blasts, no upsell campaigns.",
    "",
    "If you have questions, just reply to this email or write to leadbrokerblueprint@gmail.com. I read every message.",
    "",
    "Welcome to the work.",
    "",
    "— Lorenzo",
    "Lead Broker Blueprint",
    "leadbrokerblueprint@gmail.com",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; color: #1a1a1a; line-height: 1.6;">
<p>${greeting}</p>
<p><strong>Welcome to the Lead Broker Blueprint</strong> — your ${tier.name} purchase is confirmed.</p>
<p style="margin: 28px 0;"><a href="${loginUrl}" style="display: inline-block; background: #FF6B1A; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Log in to your members area →</a></p>
<p>When you click that link, enter the email address you used at purchase. Within ~10 seconds you'll receive a one-time login link from this same address. The link works once, expires in 15 minutes, and you can always request a fresh one.</p>

<h3 style="border-bottom: 2px solid #FF6B1A; padding-bottom: 8px; margin-top: 32px;">Your first week</h3>
<p>The Blueprint is built to be read in sequence. Here's what I'd recommend for your first seven days:</p>
<ul style="padding-left: 20px;">
<li><strong>Day 1-2 — Module 1: What Lead Brokering Actually Is.</strong> Vocabulary + four-player ecosystem. 30 min read.</li>
<li><strong>Day 3 — Module 2: The Vertical Landscape.</strong> Use the Niche Evaluation Worksheet to narrow to 1-2 verticals before reading further. This decision drives everything downstream.</li>
<li><strong>Day 4-5 — Module 3: The Regulatory Landscape.</strong> The most important compliance reading you'll do. Skip nothing here.</li>
<li><strong>Day 6 — Module 4 + Landing Your First Buyer Relationships playbook.</strong> 24 pages on outreach, pitch, negotiation. Start outreach work this week.</li>
<li><strong>Day 7 — Module 5 + the Cold-to-Warm Conversion Playbook (30 pp) + Modern &amp; Emerging Channels (32 pp).</strong> The two most-recommended deliverables in the entire Blueprint.</li>
</ul>

<h3 style="border-bottom: 2px solid #FF6B1A; padding-bottom: 8px; margin-top: 32px;">Refund policy</h3>
<p>Your 30-day refund period started today. If at any point you decide the Blueprint isn't right for you, just reply to this email with the word <strong>"refund"</strong> and I'll process it within 5 business days. No questions, no win-back, no friction.</p>

<h3 style="border-bottom: 2px solid #FF6B1A; padding-bottom: 8px; margin-top: 32px;">What to expect from me</h3>
<p>Quarterly regulatory-update emails (every 90 days, only when something material changes). Announcements when new video content drops. Nothing else. No drip sequences, no daily content blasts, no upsell campaigns.</p>

<p>If you have questions, just reply to this email or write to <a href="mailto:leadbrokerblueprint@gmail.com">leadbrokerblueprint@gmail.com</a>. I read every message.</p>

<p style="margin-top: 32px;"><em>Welcome to the work.</em></p>

<p>— Lorenzo<br>Lead Broker Blueprint</p>
</body></html>`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Lorenzo at Lead Broker Blueprint <login@leadbrokerblueprint.us>",
      to: [email],
      subject: `Welcome to the Lead Broker Blueprint — your ${tier.name} access`,
      text,
      html,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Resend ${resp.status}: ${body}`);
  }
}

function extractFirstName(fullName) {
  if (!fullName || typeof fullName !== "string") return null;
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || null;
}

// ─── Stripe signature verification ────────────────────────────
async function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const parts = signatureHeader.split(",").reduce((acc, part) => {
    const [k, v] = part.split("=");
    if (!acc[k]) acc[k] = [];
    acc[k].push(v);
    return acc;
  }, {});

  const timestamp = parts.t && parts.t[0];
  const v1Signatures = parts.v1 || [];
  if (!timestamp || v1Signatures.length === 0) return false;

  const tsNumber = parseInt(timestamp, 10);
  if (Number.isNaN(tsNumber)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - tsNumber;
  if (ageSeconds > 300 || ageSeconds < -300) return false;

  const payload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computedHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  return v1Signatures.some((sig) => constantTimeEqual(sig, computedHex));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
