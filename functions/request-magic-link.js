// /api/auth/request-magic-link — generates and emails a one-time login link

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
    return new Response(JSON.stringify({ error: "Members area not configured" }), { status: 503 });
  }

  const buyer = await env.BUYERS.get(email);
  if (!buyer) {
    return new Response(JSON.stringify({ ok: true, sent: true }), { status: 200 });
  }

  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = Date.now() + 15 * 60 * 1000;
  await env.TOKENS.put(token, JSON.stringify({ email, expiresAt }), { expirationTtl: 900 });

  const origin = new URL(request.url).origin;
  const magicLink = `${origin}/api/auth/verify-magic-link?token=${encodeURIComponent(token)}`;

  let resendStatus = null;
  let resendBody = null;
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
    resendStatus = resendResp.status;
    try { resendBody = await resendResp.text(); } catch (e) { resendBody = String(e); }
  }

  return new Response(JSON.stringify({ ok: true, sent: true, _debug: { resendStatus, resendBody } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
