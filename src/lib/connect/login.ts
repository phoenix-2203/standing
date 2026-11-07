import { randomBytes } from "node:crypto";
import type { Db } from "@/db";
import { paypalConnections } from "@/db/schema";
import { cookieHeader, readCookie, safeEqual, sessionCookie } from "@/lib/auth/session";
import { assertSandbox } from "@/lib/paypal/client";

// Log in with PayPal (BLUEPRINT §2.1), sandbox only. The code is exchanged server-side; the access token
// lives in one local variable for one userinfo call. Tokens, codes and response bodies are never logged,
// stored or sent to the browser.

const AUTHORIZE_URL = "https://www.sandbox.paypal.com/connect";
const SCOPES = "openid email https://uri.paypal.com/services/paypalattributes";
const STATE_COOKIE = "standing_oauth_state";
const STATE_TTL_SECONDS = 600;

export type Verification = "verified" | "unverified" | "unreadable";

export interface LoginConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  sellerId: string;
  appBaseUrl: string;
  allowedPayerIds?: string[]; // when set, only these PayPal accounts can open a session
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function loginConfigFromEnv(request: Request, env: Record<string, string | undefined> = process.env): LoginConfig {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET is not set");
  const allowed = env.STANDING_ALLOWED_PAYER_IDS?.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    baseUrl: env.PAYPAL_API_BASE ?? "",
    clientId: env.PAYPAL_CLIENT_ID ?? "",
    clientSecret: env.PAYPAL_CLIENT_SECRET ?? "",
    sessionSecret: env.SESSION_SECRET,
    sellerId: env.STANDING_SELLER_ID ?? "sandbox-seller",
    appBaseUrl: (env.APP_BASE_URL ?? new URL(request.url).origin).replace(/\/+$/, ""),
    // Production fails closed: with no allow-list, every login is refused rather than every PayPal account
    // getting a session on this one seller's data. Development stays open for local testing.
    allowedPayerIds: allowed?.length ? allowed : env.NODE_ENV === "production" ? [] : undefined,
  };
}

const redirectUri = (c: LoginConfig) => `${c.appBaseUrl}/api/auth/paypal/callback`;
const secure = (c: LoginConfig) => c.appBaseUrl.startsWith("https://");

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

/** GET /api/auth/paypal/start: remember a random state in a cookie and send the seller to PayPal. */
export function startLogin(config: LoginConfig): Response {
  assertSandbox(config.baseUrl);
  const state = randomBytes(32).toString("base64url");
  const q = new URLSearchParams({ flowEntry: "static", client_id: config.clientId, response_type: "code", scope: SCOPES, redirect_uri: redirectUri(config), state });
  return redirect(`${AUTHORIZE_URL}?${q}`, [cookieHeader(STATE_COOKIE, state, STATE_TTL_SECONDS, secure(config))]);
}

/** Compares to the string "true" explicitly: the API returns a string, and "false" is truthy. */
export function classifyVerification(info: unknown): Verification {
  const v = (info as { verified_account?: unknown } | null)?.verified_account;
  if (v === "true") return "verified";
  if (v === "false") return "unverified";
  return "unreadable"; // missing, a boolean, anything else: never assume unverified
}

/** GET /api/auth/paypal/callback */
export async function handleCallback(request: Request, db: Db, config: LoginConfig, now = new Date()): Promise<Response> {
  const base = assertSandbox(config.baseUrl);
  const url = new URL(request.url);
  const clearState = cookieHeader(STATE_COOKIE, "", 0, secure(config));
  const back = (result: string, cookies: string[] = []) => redirect(`${config.appBaseUrl}/checklist?connect=${result}`, [clearState, ...cookies]);

  const expected = readCookie(request, STATE_COOKIE);
  const state = url.searchParams.get("state");
  if (!expected || !state || !safeEqual(expected, state)) return back("bad_state");
  if (url.searchParams.get("error")) return back("cancelled");
  const code = url.searchParams.get("code");
  if (!code) return back("failed");

  const f = config.fetch ?? globalThis.fetch;
  const timeout = () => AbortSignal.timeout(config.timeoutMs ?? 30_000);

  // Exchange the code. A failure here means the login didn't complete: nothing is stored.
  let accessToken: string | undefined;
  try {
    const basic = Buffer.from(`${config.clientId.trim()}:${config.clientSecret.trim()}`).toString("base64");
    const res = await f(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(config) }).toString(),
      signal: timeout(),
    });
    if (!res.ok) {
      console.error(`Log in with PayPal: token exchange HTTP ${res.status} (debug ${res.headers.get("paypal-debug-id")})`);
      return back("failed");
    }
    accessToken = ((await res.json()) as { access_token?: string }).access_token;
  } catch (err) {
    console.error(`Log in with PayPal: token exchange failed (${(err as Error).name})`);
    return back("failed");
  }
  if (!accessToken) return back("failed");

  // Read the verification status. Any failure here is "couldn't read", never "unverified".
  let verification: Verification = "unreadable";
  let payerId: string | null = null;
  let debugId: string | null = null;
  let lastError: string | null = null;
  try {
    const res = await f(`${base}/v1/identity/openidconnect/userinfo?schema=openid`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: timeout() });
    debugId = res.headers.get("paypal-debug-id");
    if (res.ok) {
      const info = (await res.json()) as { payer_id?: unknown };
      verification = classifyVerification(info);
      payerId = typeof info.payer_id === "string" ? info.payer_id : null;
      if (verification === "unreadable") lastError = "verified_account missing or not a string";
    } else {
      lastError = `HTTP ${res.status}`;
    }
  } catch (err) {
    lastError = (err as Error).name;
  }

  if (config.allowedPayerIds && !(payerId && config.allowedPayerIds.includes(payerId))) {
    // Not this seller's account (or not provable): no session, and their result can't overwrite the seller's.
    return back(verification === "unreadable" ? "unreadable" : "not_allowed");
  }

  const row = { sellerId: config.sellerId, verification, payerId, debugId, lastError, checkedAt: now };
  await db.insert(paypalConnections).values(row).onConflictDoUpdate({ target: paypalConnections.sellerId, set: row });
  return back(verification, [sessionCookie(config.sellerId, config.sessionSecret, secure(config), now)]);
}
