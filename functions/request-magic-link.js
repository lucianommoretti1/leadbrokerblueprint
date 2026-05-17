// TEMPORARY DEBUG MODE: returns diagnostic info in response body.

export async function onRequest(context) {
  const { request, env } = context;
  const debug = {};

  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try { body = await request.json(); }
  catch (e) { return new Response(JSON.stringify({ error: "Invalid JSON", debug }), { status: 400 }); }
  debug.bodyReceived = body;

  const email = String(body.email || "").trim().toLowerCase();
  debug.normalizedEmail = email;
  debug.emailLength = email.length;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "Invalid email", debug }), { status: 400 });
  }

  if (!env || !env.BUYERS) {
    return new Response(JSON.stringify({ error: "BUYERS binding missing", debug }), { status: 503 });
  }
  debug.buyersBindingPresent = true;
  debug.resendKeyPresent = !!env.RESEND_API_KEY;
  debug.authSecretPresent = !!env.AUTH_SECRET;

  const buyer = await env.BUYERS.get(email);
  debug.kvLookupResult = buyer === null ? "NULL" : String(buyer).substring(0, 100);

  try {
    const list = await env.BUYERS.list({ limit: 10 });
    debug.kvAllKeys = list.keys.map(k => ({ name: k.name, length: k.name.length, hex: [...k.name].map(c => c.charCodeAt(0).toString(16)).join(" ") }));
  } catch (e) { debug.kvListError = String(e); }

  if (!buyer) {
    return new Response(JSON.stringify({ ok: true, sent: false, reason: "buyer_not_found", debug }), { status: 200 });
  }

  return new Response(JSON.stringify({ ok: true, sent: true, debug, message: "Would send email here" }), { status: 200 });
}
