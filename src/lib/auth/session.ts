import { createHmac, timingSafeEqual } from "node:crypto";

// Signed session cookie set when Log in with PayPal completes. Seller routes require it. The cookie holds
// only the seller ID and an expiry, signed with SESSION_SECRET; no PayPal token is ever in it.

const COOKIE = "standing_session";
const TTL_SECONDS = 8 * 3600;

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export function cookieHeader(name: string, value: string, maxAge: number, secure: boolean): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function sessionCookie(sellerId: string, secret: string, secure: boolean, now = new Date()): string {
  const payload = `${Buffer.from(sellerId).toString("base64url")}.${Math.floor(now.getTime() / 1000) + TTL_SECONDS}`;
  return cookieHeader(COOKIE, `${payload}.${sign(payload, secret)}`, TTL_SECONDS, secure);
}

/** The session's seller ID, or null if there's no valid, unexpired session. Fails closed without a secret. */
export function sessionSeller(request: Request, secret = process.env.SESSION_SECRET, now = new Date()): string | null {
  if (!secret) return null;
  const parts = readCookie(request, COOKIE)?.split(".");
  if (parts?.length !== 3) return null;
  const [seller, exp, sig] = parts;
  if (!safeEqual(sig, sign(`${seller}.${exp}`, secret))) return null;
  if (Number(exp) * 1000 <= now.getTime()) return null;
  return Buffer.from(seller, "base64url").toString();
}

export const unauthorized = () => Response.json({ error: "not_connected" }, { status: 401 });
