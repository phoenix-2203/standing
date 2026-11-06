import { sessionCookie } from "@/lib/auth/session";

// Development only: open a session without PayPal, because PayPal won't redirect logins to localhost.
// Off unless STANDING_DEV_LOGIN=1, and always off in a production build (404).
export async function GET(request: Request) {
  const target = new URL("/dashboard", request.url); // reading the request keeps this per-request
  if (process.env.NODE_ENV === "production" || process.env.STANDING_DEV_LOGIN !== "1" || !process.env.SESSION_SECRET) {
    return new Response("Not found", { status: 404 });
  }
  const headers = new Headers({ Location: target.toString() });
  headers.append("Set-Cookie", sessionCookie(process.env.STANDING_SELLER_ID ?? "sandbox-seller", process.env.SESSION_SECRET, false));
  return new Response(null, { status: 302, headers });
}
