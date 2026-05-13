// /api/stripe-webhook — Stripe webhook handler.
//
// Activates a buyer in the members area after a successful checkout.
// In v1 we authorize buyers by writing their email to a Cloudflare KV
// store (or Netlify Blobs).  At launch, the magic-link-auth function
// (see request-magic-link.js) reads from the same store to decide who
// can log in.
//
// Required environment variables:
//   STRIPE_WEBHOOK_SECRET    — set in Stripe Dashboard → Developers → Webhooks
//   KV namespace 'BUYERS'    — bound in Cloudflare Pages settings, or use Netlify Blobs
//
// Stripe products to create (Dashboard → Products):
//   - "Lead Broker Blueprint"             $297   one-time
//   - "Lead Broker Blueprint + Add Ons"   $1,297 one-time
//   - "Lead Broker Blueprint + Mentorship" $2,997 one-time
//
// Set Webhook endpoint URL: https://leadbrokerblueprint.com/api/stripe-webhook
// Listen to events: checkout.session.completed, charge.refunded

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify Stripe signature.  Activation: install Stripe SDK or implement
  // the HMAC check manually using the StripeSig header + STRIPE_WEBHOOK_SECRET.
  // (Cloudflare Workers + Pages: install via `npm install stripe` if using Node compat,
  //  or use Web Crypto API for manual HMAC.)
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  // Read raw body for verification
  const rawBody = await request.text();

  // TODO at launch: verify signature against env.STRIPE_WEBHOOK_SECRET
  // const stripe = require('stripe')(env.STRIPE_SECRET_KEY);
  // const event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Handle the events we care about
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = (session.customer_details && session.customer_details.email) || session.customer_email;
    if (!email) return new Response("No email on session", { status: 400 });

    // Determine tier from line_items or price_id (look these up against your Stripe products)
    // const tier = mapPriceIdToTier(session?.line_items?.data?.[0]?.price?.id);
    const tier = "blueprint"; // placeholder — replace with real mapping after Stripe products exist

    // Authorize the email in the BUYERS store
    if (env.BUYERS) {
      await env.BUYERS.put(email.toLowerCase(), JSON.stringify({
        email,
        tier,
        purchasedAt: new Date().toISOString(),
        stripeSessionId: session.id,
      }));
    } else {
      console.warn("BUYERS KV not bound — authorization not persisted");
    }

    // (Optional) send purchase confirmation + first magic link
    // await sendPurchaseConfirmation(env, email, tier);

    return new Response(JSON.stringify({ ok: true, authorized: email }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const email = charge.billing_details && charge.billing_details.email;
    if (email && env.BUYERS) {
      await env.BUYERS.delete(email.toLowerCase());
    }
    return new Response(JSON.stringify({ ok: true, revoked: email }), { status: 200 });
  }

  return new Response(JSON.stringify({ ok: true, ignored: event.type }), { status: 200 });
}
