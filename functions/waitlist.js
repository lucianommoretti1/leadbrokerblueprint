// /api/waitlist  — Cloudflare Pages / Netlify Functions handler
//
// Receives waitlist signups from the homepage form.  In v1 (pre-launch),
// forwards each signup to leadbrokerblueprint@gmail.com via Resend.
// At launch, swap in an email-service-provider integration (Kit/Buttondown).
//
// Activation steps:
//   1. Add environment variable RESEND_API_KEY to your hosting provider.
//   2. Add environment variable NOTIFICATION_EMAIL = leadbrokerblueprint@gmail.com.
//   3. Redeploy.  No code change needed.
//
// Both Cloudflare Pages and Netlify support the export-default / exports.handler
// patterns this file uses.  Adjust the request-handling boilerplate to match
// your chosen host once you pick one.

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const email = String(body.email || "").trim();
  const source = String(body.source || "/").slice(0, 200);
  const ts = body.ts || new Date().toISOString();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "Invalid email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // If RESEND_API_KEY is not set, log the signup so we don't lose it
  if (!env || !env.RESEND_API_KEY) {
    console.log("WAITLIST signup (no email provider configured):", { email, source, ts });
    return new Response(JSON.stringify({ ok: true, mode: "logged" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Forward to your inbox via Resend
  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Lead Broker Blueprint <waitlist@leadbrokerblueprint.com>",
      to: [env.NOTIFICATION_EMAIL || "leadbrokerblueprint@gmail.com"],
      reply_to: email,
      subject: `Waitlist signup — ${email}`,
      text: `New waitlist signup:\n\nEmail: ${email}\nSource: ${source}\nTimestamp: ${ts}\n\n(This signup arrived via the Lead Broker Blueprint marketing site.)`,
    }),
  });

  if (!resendResp.ok) {
    const errBody = await resendResp.text();
    console.warn("Resend error:", resendResp.status, errBody);
    // Don't fail user-facing — log and return ok so the signup isn't lost from their side
    return new Response(JSON.stringify({ ok: true, mode: "partial" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
