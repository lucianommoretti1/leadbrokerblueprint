// /api/auth/logout — server-side sign-out.
//
// The session cookie (lbb_member) is HttpOnly, so client-side JavaScript
// cannot clear it. This endpoint expires it server-side (along with the
// non-HttpOnly lbb_member_email display cookie) and redirects to the
// login page.

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const headers = new Headers();
  headers.set("Location", `${url.origin}/members/login.html`);
  // Expire both cookies. Attributes must match the ones used when setting
  // (Path=/; Secure; SameSite=Lax) for the browser to overwrite them.
  headers.append(
    "Set-Cookie",
    "lbb_member=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
  );
  headers.append(
    "Set-Cookie",
    "lbb_member_email=; Path=/; Max-Age=0; Secure; SameSite=Lax"
  );

  return new Response(null, { status: 302, headers });
}
