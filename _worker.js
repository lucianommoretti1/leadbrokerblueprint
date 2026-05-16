// _worker.js — entry point for the Lead Broker Blueprint Worker.
//
// Routes /api/* paths to the corresponding handler function and falls back
// to static assets for everything else. Also gates /members/* pages so
// only logged-in buyers can access the curriculum.

import { onRequest as waitlistHandler } from "./functions/waitlist.js";
import { onRequest as stripeWebhookHandler } from "./functions/stripe-webhook.js";
import { onRequest as requestMagicLinkHandler } from "./functions/request-magic-link.js";
import { onRequest as verifyMagicLinkHandler } from "./functions/verify-magic-link.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const context = { request, env, ctx };

    // ---------- API routes ----------
    if (path === "/api/waitlist") {
      return waitlistHandler(context);
    }
    if (path === "/api/stripe/webhook" || path === "/api/stripe-webhook") {
      return stripeWebhookHandler(context);
    }
    if (path === "/api/auth/request-magic-link") {
      return requestMagicLinkHandler(context);
    }
    if (path === "/api/auth/verify-magic-link") {
      return verifyMagicLinkHandler(context);
    }

    // ---------- Members area gate ----------
    // /members/login.html is public so visitors can request a magic link.
    // Everything else under /members/ requires a valid session cookie.
    if (path.startsWith("/members/") && path !== "/members/login.html") {
      const ok = await verifyMemberSession(request, env);
      if (!ok) {
        return Response.redirect(`${url.origin}/members/login.html`, 302);
      }
    }

    // ---------- Static assets ----------
    return env.ASSETS.fetch(request);
  },
};

// Verifies the lbb_member cookie's HMAC signature and expiration.
async function verifyMemberSession(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = /(?:^|;\s*)lbb_member=([^;]+)/.exec(cookieHeader);
  if (!match) return false;

  const session = decodeURIComponent(match[1]);
  const [data, sig] = session.split(".");
  if (!data || !sig) return false;
  if (!env.AUTH_SECRET) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  let sigBytes;
  try {
    sigBytes = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
  } catch (e) {
    return false;
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    encoder.encode(data)
  );
  if (!valid) return false;

  try {
    const payload = JSON.parse(atob(data));
    if (payload.expiresAt && payload.expiresAt < Date.now()) return false;
    return true;
  } catch (e) {
    return false;
  }
}
