// /api/auth/verify-magic-link — consumes a magic-link token, sets a session cookie
//
// User clicks the link in their email → this function runs → token is consumed
// (one-time use) → session cookie is set → user is redirected to /members/dashboard.html
//
// The session cookie is a short signed token containing the user's email and an
// expiration (30 days).  It is HttpOnly, Secure, SameSite=Lax.
//
// Required bindings: TOKENS (KV), AUTH_SECRET (env var)

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  if (!token) return new Response("Missing token", { status: 400 });
  if (!env || !env.TOKENS) {
    return new Response("Auth backend not configured (members area activates at launch).", { status: 503 });
  }

  // Look up token
  const stored = await env.TOKENS.get(token);
  if (!stored) {
    return new Response("Invalid or expired login link. Request a new one at /members/login.html", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let parsed;
  try { parsed = JSON.parse(stored); } catch (e) { return new Response("Corrupted token", { status: 500 }); }

  if (parsed.expiresAt < Date.now()) {
    await env.TOKENS.delete(token);
    return new Response("Link expired. Request a new one at /members/login.html", { status: 401 });
  }

  // Consume the token (one-time use)
  await env.TOKENS.delete(token);

  // Create the session cookie value (signed)
  const sessionPayload = {
    email: parsed.email,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };
  const session = await signSession(sessionPayload, env.AUTH_SECRET);

  // Redirect to dashboard, setting the session cookie
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/members/dashboard.html",
      "Set-Cookie": `lbb_member=${encodeURIComponent(session)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

// Simple HMAC-signed payload.  In production consider a JWT library.
async function signSession(payload, secret) {
  const encoder = new TextEncoder();
  const json = JSON.stringify(payload);
  const data = btoa(json);

  if (!secret) {
    console.warn("AUTH_SECRET not set — session not actually signed");
    return data + ".unsigned";
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64}`;
}
