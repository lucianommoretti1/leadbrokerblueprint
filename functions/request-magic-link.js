// /api/auth/request-magic-link — generates and emails a one-time login link
//
// Flow:
//   1. User enters their email at /members/login.html
//   2. This function looks up the email in the BUYERS KV store
//   3. If authorized, generates a 15-minute token, stores it in TOKENS KV,
//      and emails the user a one-time login link via Resend
//   4. User clicks link → /api/auth/verify-magic-link consumes the token
//      and sets a session cookie → redirects to /members/dashboard.html
//
// Required bindings/secrets:
//   RESEND_API_KEY   — for sending the magic-link email
//   AUTH_SECRET      — random 32+ char string for token signing (used by verify)
//   BUYERS, TOKENS   — KV namespaces

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try { body = await request.json(); }
  catch (e) { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "Invalid email" }), { status: 400 });
  }

  if (!env || !env.BUYERS) {
    return new Response(JSON.stringify({
      error: "Members area activates at launch",
      hint: "If you're an early purchaser, email leadbrokerblueprint@gmail.com for manual access.",
    }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  // Anti-enumeration: response shape is identical whether or not the email is on the buyer list.
  const buyer = await env.BUYERS.get(email);
  if (!buyer) {
    return new Response(JSON.stringify({ ok: true, sent: true }), { status: 200 });
  }

  // Generate a random one-time token
  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
  await env.TOKENS.put(token, JSON.stringify({ email, expiresAt }), { expirationTtl: 900 });

  const origin = new URL(request.url).origin;
  const magicLink = `${origin}/api/auth/verify-magic-link?token=${encodeURIComponent(token)}`;

  // Send the magic-link email via Resend
  if (env.RESEND_API_KEY) {
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
          "— Lorenzo",
          "leadbrokerblueprint@gmail.com",
        ].join("\n"),
      }),
    });
    if (!resendResp.ok) {
      // Log server-side only; the client response shape stays identical.
      console.error("Resend send failed:", resendResp.status, await resendResp.text().catch(() => ""));
    }
  }

  return new Response(JSON.stringify({ ok: true, sent: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
