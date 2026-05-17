// /api/stripe/webhook — Stripe webhook handler.
//
// Fires every time Stripe has news for us. We care about two events:
//   - checkout.session.completed → activate buyer (add to BUYERS KV)
//   - charge.refunded             → revoke buyer (remove from BUYERS KV)
//
// Required bindings/secrets:
//   STRIPE_WEBHOOK_SECRET   — Stripe Dashboard → Developers → Webhooks → endpoint → Signing secret
//   BUYERS                  — KV namespace binding (defined in wrangler.jsonc)
//
// Webhook endpoint to configure in Stripe Dashboard:
//   https://leadbrokerblueprint.us/api/stripe/webhook
// Events to listen to:
//   checkout.session.completed
//   charge.refunded

// Map amount_total (in cents) to a tier identifier.
// Using amount keeps this resilient if we ever create new price IDs for the same products.
const TIER_BY_AMOUNT = {
  69700: "blueprint",
  269700: "blueprint_community",
  489700: "blueprint_mentorship",
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.warn("STRIPE_WEBHOOK_SECRET not set — rejecting webhook for safety");
    return new Response("Webhook backend not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature") || "";
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  const rawBody = await request.text();

  // Verify the Stripe signature.
  const verified = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }

  // ─── checkout.session.completed ───────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = (session.customer_details && session.customer_details.email) || session.customer_email;
    if (!email) {
      return new Response(JSON.stringify({ error: "No email on session" }), { status: 400 });
    }

    const tier = TIER_BY_AMOUNT[session.amount_total] || "unknown";

    if (env.BUYERS) {
      await env.BUYERS.put(
        email.toLowerCase(),
        JSON.stringify({
          email,
          tier,
          amount: session.amount_total,
          purchasedAt: new Date().toISOString(),
          stripeSessionId: session.id,
        })
      );
    } else {
      console.warn("BUYERS KV not bound — authorization not persisted");
    }

    return new Response(JSON.stringify({ ok: true, authorized: email, tier }), {
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

  // Any other event: acknowledge but don't act.
  return new Response(JSON.stringify({ ok: true, ignored: event.type }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Verify Stripe's signature header against the raw request body.
// Format of stripe-signature: t=<unix_ts>,v1=<hex_sig>,v0=<old>
// Computed sig: HMAC-SHA256 of `${t}.${rawBody}` with the endpoint secret.
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

  // Reject events older than 5 minutes to prevent replay attacks.
  const tsNumber = parseInt(timestamp, 10);
  if (Number.isNaN(tsNumber)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - tsNumber;
  if (ageSeconds > 300 || ageSeconds < -300) return false;

  const payload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computedHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time compare against each provided v1 signature.
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
