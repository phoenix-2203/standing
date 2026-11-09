import { clearSessionCookie } from "@/lib/auth/session";

// Log out: expire the session cookie and go back to the homepage. POST only, so a link, prefetch or image can't
// sign anyone out; a cross-site form is refused by the proxy's cross-site write check (lib/auth/origin.ts).
// Nothing at PayPal changes: Standing never stored a PayPal token, so there's nothing to revoke.
export async function POST(request: Request) {
  const base = (process.env.APP_BASE_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
  const headers = new Headers({ Location: `${base}/`, "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearSessionCookie(base.startsWith("https://")));
  return new Response(null, { status: 303, headers });
}
