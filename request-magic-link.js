// /api/auth/request-magic-link — generates and emails a one-time login link
//
// TEMPORARY DEBUG MODE: returns full diagnostic info in the response body
// instead of relying on console.log (which isn't surfacing in dashboard).
// REVERT THIS AFTER DEBUGGING — currently leaks buyer enumeration.

export async function onRequest(context) {
  const { request, env } = context;
  const debug = {};

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try { body = await request.json(); }
  catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON", debug }), { status: 400 });
  }
  debug.bodyReceived = body;

  const email = String(body.email || "").trim().toLowerCase();
  debug.normalizedEmail = email;
  debug.emailLength = email.length;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "Invalid email", debug }), { status: 400 });
  }

  if (!env || !env.BUYERS) {
    debug.error = "BUYERS binding missing";
    return new Response(JSON.stringify({ error: "Members area not configured", debug }), { status: 503 });
  }
  debug.buyersBindingPresent = true;
  debug.tokensBindingPresent = !!env.TOKENS;
  debug.resendKeyPresent = !!env.RESEND_API_KEY;
  debug.authSecretPresent = !!env.AUTH_SECRET;

  const buyer = await env.BUYERS.get(email);
  debug.kvLookupResult = buyer === null ? "NULL" : (typeof buyer === "string" ? buyer.substring(0, 100) : String(buyer));

  try {
    const list = await env.BUYERS.list({ limit: 10 });
    debug.kvAllKeys = list.keys.map(k => ({ name: k.name, nameLength: k.name.length, nameHex: [...k.name].map(c => c.charCodeAt(0).toString(16)).join(" ") }));
  } catch (e) {
    debug.kvListError = String(e);
  }

  if (!buyer) {
    return new Response(JSON.stringify({ ok: true, sent: false, reason: "buyer_not_found", debug }), { status: 200 });
  }

  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = Date.now() + 15 * 60 * 1000;
  await env.TOKENS.put(token, JSON.stringify({ email, expiresAt }), { expirationTtl: 900 });

  const origin = new URL(request.url).origin;
  const magicLink = `${origin}/api/auth/verify-magic-link?token=${encodeURIComponent(token)}`;
  debug.magicLink = magicLink;

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
          "— Luciano",
          "leadbrokerblueprint@gmail.com",
        ].join("\n"),
      }),
    });
    const respBody = await resendResp.text();
    debug.resendStatus = resendResp.status;
    debug.resendBody = respBody;
  } else {
    debug.resendSkipped = "RESEND_API_KEY not set";
  }

  return new Response(JSON.stringify({ ok: true, sent: true, debug }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
