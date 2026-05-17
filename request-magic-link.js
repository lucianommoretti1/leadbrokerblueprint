// /api/auth/request-magic-link — generates and emails a one-time login link
//
// Flow:
//   1. User enters their email at /members/login.html
//   2. This function looks up the email in the BUYERS KV store
//   3. If authorized, it generates a 15-minute JWT-like token, stores it in
//      the TOKENS KV store, and emails the user a one-time login link
//   4. User clicks the link → /api/auth/verify-magic-link consumes the token
//      and sets a session cookie → user is redirected to /members/dashboard.html
//
// Required environment variables / bindings:
//   RESEND_API_KEY            — for sending the magic-link email
//   AUTH_SECRET               — random 32+ char string for token signing
//   KV namespaces: BUYERS, TOKENS

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try { body = await request.json(); }
  catch (e) { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "Invalid email" }), { status: 400 });
  }

  // Pre-launch placeholder: if BUYERS KV isn't bound yet, return 503
  if (!env || !env.BUYERS) {
    return new Response(JSON.stringify({
      error: "Members area activates at launch",
      hint: "If you're an early purchaser, email leadbrokerblueprint@gmail.com for manual access.",
    }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  // Check if the email is an authorized buyer
  const buyer = await env.BUYERS.get(email);
  console.log("DEBUG magic-link: lookup email=", JSON.stringify(email), "buyer=", JSON.stringify(buyer));
  if (!buyer) {
    // Do not reveal whether the email is authorized — return the same response
    // either way to prevent account-enumeration.
    return new Response(JSON.stringify({ ok: true, sent: true }), { status: 200 });
  }

  // Generate a random token
  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

  // Store the token (single-use)
  await env.TOKENS.put(token, JSON.stringify({ email, expiresAt }), { expirationTtl: 900 });

  // Construct the magic link
  const origin = new URL(request.url).origin;
  const magicLink = `${origin}/api/auth/verify-magic-link?token=${encodeURIComponent(token)}`;

  // Send the magic-link email via Resend
  if (env.RESEND_API_KEY) {
    console.log("DEBUG magic-link: calling Resend for", email);
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Lead Broker Blueprint <login@leadbrokerblueprint.us>",
        to: [email],
        subject: "Your Lead Broker Blueprint login link",
        text: [
          "Click the link below to sign in to the Lead Broker Blueprint members area.",
          "This link expires in 15 minutes and is good for one use only.",
          "",
          magicLink,
          "",
          "If you didn't request this, you can ignore the email — your account isn't affected.",
          "",
          "— Luciano",
          "leadbrokerblueprint@gmail.com",
        ].join("\n"),
      }),
    });
    const respBody = await resendResp.text();
    console.log("DEBUG magic-link: Resend status=", resendResp.status, "body=", respBody);
  } else {
    console.warn("RESEND_API_KEY not set — magic link not actually sent:", magicLink);
  }

  return new Response(JSON.stringify({ ok: true, sent: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
