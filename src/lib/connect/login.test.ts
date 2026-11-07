import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { paypalConnections } from "@/db/schema";
import { sessionSeller } from "@/lib/auth/session";
import { SANDBOX_BASE } from "@/lib/paypal/client";
import { testDb } from "@/test/helpers";
import { buildChecklist } from "./checklist";
import { classifyVerification, handleCallback, type LoginConfig, loginConfigFromEnv, startLogin } from "./login";

const SECRET = "test-session-secret";
const TOKEN = "A21AA-super-secret-access-token";
const CODE = "C21AA-auth-code";
const NOW = new Date("2026-11-07T10:00:00Z");

type Userinfo = () => Response;
function config(userinfo: Userinfo, over: Partial<LoginConfig> & { tokenStatus?: number } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/v1/oauth2/token")) {
      return over.tokenStatus ? new Response("{}", { status: over.tokenStatus, headers: { "paypal-debug-id": "dbg-token" } }) : Response.json({ access_token: TOKEN, refresh_token: "R-secret" });
    }
    return userinfo();
  }) as unknown as typeof globalThis.fetch;
  const c: LoginConfig = { baseUrl: SANDBOX_BASE, clientId: "client-id", clientSecret: "client-secret", sessionSecret: SECRET, sellerId: "seller-1", appBaseUrl: "https://standing.test", fetch, ...over };
  return { c, calls };
}
const info = (body: object, status = 200) => () => Response.json(body, { status, headers: { "paypal-debug-id": "dbg-info" } });
const callback = (query: string, cookie = "standing_oauth_state=abc") =>
  new Request(`https://standing.test/api/auth/paypal/callback?${query}`, { headers: cookie ? { cookie } : {} });
const good = `code=${CODE}&state=abc`;
const rowOf = async () => (await db.select().from(paypalConnections))[0];
const cookieFrom = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("standing_session="))?.split(";")[0];
const sessionFrom = (res: Response) => {
  const cookie = cookieFrom(res);
  return cookie ? sessionSeller(new Request("https://x", { headers: { cookie } }), SECRET, NOW) : null;
};

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  await db.delete(paypalConnections);
});
afterEach(() => vi.restoreAllMocks());

describe("classifyVerification", () => {
  it.each([
    [{ verified_account: "true" }, "verified"],
    [{ verified_account: "false" }, "unverified"],
    [{ verified_account: true }, "unreadable"], // not the documented string
    [{ verified_account: false }, "unreadable"],
    [{ verified_account: "TRUE" }, "unreadable"],
    [{}, "unreadable"],
    [null, "unreadable"],
  ])("%j → %s", (body, expected) => expect(classifyVerification(body)).toBe(expected));
});

describe("startLogin", () => {
  it("redirects to the sandbox with the scopes, callback and a random state kept in an httpOnly cookie", () => {
    const res = startLogin(config(info({})).c);
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location")!);
    expect(url.origin + url.pathname).toBe("https://www.sandbox.paypal.com/connect");
    expect(url.searchParams.get("redirect_uri")).toBe("https://standing.test/api/auth/paypal/callback");
    expect(url.searchParams.get("scope")).toBe("openid email https://uri.paypal.com/services/paypalattributes");
    const state = url.searchParams.get("state")!;
    expect(state.length).toBeGreaterThanOrEqual(40);
    expect(res.headers.getSetCookie()[0]).toBe(`standing_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`);
    expect(new URL(startLogin(config(info({})).c).headers.get("location")!).searchParams.get("state")).not.toBe(state);
  });

  it("refuses a non-sandbox API base", () => {
    expect(() => startLogin(config(info({}), { baseUrl: "https://api-m.paypal.com" }).c)).toThrow(/only https:\/\/api-m\.sandbox/);
  });
});

describe("handleCallback: the three states", () => {
  it("verified: stores it, opens a session, checklist item 1 is done", async () => {
    const { c, calls } = config(info({ verified_account: "true", payer_id: "PAYER1" }));
    const res = await handleCallback(callback(good), db, c, NOW);
    expect(res.headers.get("location")).toBe("https://standing.test/checklist?connect=verified");
    expect(await rowOf()).toMatchObject({ sellerId: "seller-1", verification: "verified", payerId: "PAYER1", debugId: "dbg-info", lastError: null });
    expect(sessionFrom(res)).toBe("seller-1");
    expect(calls[1].url).toBe(`${SANDBOX_BASE}/v1/identity/openidconnect/userinfo?schema=openid`);
    expect((await buildChecklist(db, "seller-1"))[0]).toMatchObject({ state: "done", title: "PayPal account verified" });
  });

  it('unverified (the string "false"): checklist item 1 asks the seller to verify', async () => {
    const res = await handleCallback(callback(good), db, config(info({ verified_account: "false", payer_id: "PAYER2" })).c, NOW);
    expect(res.headers.get("location")).toContain("connect=unverified");
    expect(await rowOf()).toMatchObject({ verification: "unverified" });
    const [item] = await buildChecklist(db, "seller-1");
    expect(item).toMatchObject({ id: "verified-seller", state: "todo", title: "Verify your PayPal account" });
    expect(item.detail).not.toMatch(/release|hold|limit/i);
  });

  it.each<[string, Userinfo]>([
    ["HTTP 401 (seen live 31 Oct)", info({}, 401)],
    ["HTTP 500", info({ name: "INTERNAL_SERVER_ERROR" }, 500)],
    ["a missing field", info({ payer_id: "P" })],
    ["a boolean instead of the string", info({ verified_account: false, payer_id: "P" })],
    ["invalid JSON", () => new Response("<html>", { status: 200 })],
    ["a network failure", () => { throw new TypeError("fetch failed"); }],
  ])("couldn't read on %s: never assumes unverified", async (_n, userinfo) => {
    const res = await handleCallback(callback(good), db, config(userinfo).c, NOW);
    expect(res.headers.get("location")).toContain("connect=unreadable");
    expect(await rowOf()).toMatchObject({ verification: "unreadable" });
    expect((await rowOf()).lastError).toBeTruthy();
    const [item] = await buildChecklist(db, "seller-1");
    expect(item).toMatchObject({ state: "unknown", title: "Couldn't read your verification status" });
    expect(item.detail).toContain("doesn't mean your account is unverified");
  });

  it("a later good login replaces an earlier couldn't-read", async () => {
    await handleCallback(callback(good), db, config(info({}, 401)).c, NOW);
    await handleCallback(callback(good), db, config(info({ verified_account: "true" })).c, NOW);
    expect(await db.select().from(paypalConnections)).toHaveLength(1);
    expect(await rowOf()).toMatchObject({ verification: "verified", lastError: null });
  });
});

describe("handleCallback: state and failures", () => {
  it.each([
    ["wrong state", "code=x&state=evil", "standing_oauth_state=abc"],
    ["missing state param", "code=x", "standing_oauth_state=abc"],
    ["missing cookie", "code=x&state=abc", ""],
  ])("%s: no PayPal call, nothing stored, no session", async (_n, query, cookie) => {
    const { c, calls } = config(info({ verified_account: "true" }));
    const res = await handleCallback(callback(query, cookie), db, c, NOW);
    expect(res.headers.get("location")).toContain("connect=bad_state");
    expect(calls).toHaveLength(0);
    expect(await db.select().from(paypalConnections)).toHaveLength(0);
    expect(cookieFrom(res)).toBeUndefined();
  });

  it("clears the state cookie so a state can't be replayed", async () => {
    const res = await handleCallback(callback(good), db, config(info({ verified_account: "true" })).c, NOW);
    expect(res.headers.getSetCookie()).toContain("standing_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure");
  });

  it("the seller cancelling at PayPal stores nothing", async () => {
    const { c, calls } = config(info({}));
    const res = await handleCallback(callback("error=access_denied&state=abc"), db, c, NOW);
    expect(res.headers.get("location")).toContain("connect=cancelled");
    expect(calls).toHaveLength(0);
  });

  it("a failed token exchange stores nothing and opens no session", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleCallback(callback(good), db, config(info({}), { tokenStatus: 401 }).c, NOW);
    expect(res.headers.get("location")).toContain("connect=failed");
    expect(await db.select().from(paypalConnections)).toHaveLength(0);
    expect(cookieFrom(res)).toBeUndefined();
  });

  it("the allow-list keeps other PayPal accounts out and can't overwrite the seller's status", async () => {
    await handleCallback(callback(good), db, config(info({ verified_account: "true", payer_id: "OWNER" }), { allowedPayerIds: ["OWNER"] }).c, NOW);
    const res = await handleCallback(callback(good), db, config(info({ verified_account: "false", payer_id: "STRANGER" }), { allowedPayerIds: ["OWNER"] }).c, NOW);
    expect(res.headers.get("location")).toContain("connect=not_allowed");
    expect(cookieFrom(res)).toBeUndefined();
    expect(await rowOf()).toMatchObject({ verification: "verified", payerId: "OWNER" });
  });

  it("production with no allow-list refuses every login instead of letting any PayPal account in", async () => {
    const r = new Request("https://standing.test/api/auth/paypal/callback");
    const env = (extra: Record<string, string>) => loginConfigFromEnv(r, { SESSION_SECRET: SECRET, ...extra });
    expect(env({ NODE_ENV: "production" }).allowedPayerIds).toEqual([]);
    expect(env({ NODE_ENV: "production", STANDING_ALLOWED_PAYER_IDS: " A , B " }).allowedPayerIds).toEqual(["A", "B"]);
    expect(env({ NODE_ENV: "development" }).allowedPayerIds).toBeUndefined();

    const res = await handleCallback(callback(good), db, config(info({ verified_account: "true", payer_id: "ANYONE" }), { allowedPayerIds: [] }).c, NOW);
    expect(res.headers.get("location")).toContain("connect=not_allowed");
    expect(cookieFrom(res)).toBeUndefined();
    expect(await db.select().from(paypalConnections)).toHaveLength(0);
  });
});

describe("secrets stay server-side", () => {
  it("no token, code or client secret reaches the browser, the logs or the database", async () => {
    const log = vi.spyOn(console, "log");
    const err = vi.spyOn(console, "error");
    const { c, calls } = config(info({ verified_account: "true", payer_id: "P" }));
    const res = await handleCallback(callback(good), db, c, NOW);
    const browser = [res.headers.get("location"), ...res.headers.getSetCookie(), await res.text()].join(" ");
    const stored = JSON.stringify(await rowOf());
    const logged = JSON.stringify([...log.mock.calls, ...err.mock.calls]);
    for (const secret of [TOKEN, "R-secret", CODE, "client-secret", "client-id"]) {
      expect(browser).not.toContain(secret);
      expect(stored).not.toContain(secret);
      expect(logged).not.toContain(secret);
    }
    // The code travels only in the token request body, server to server.
    expect(calls[0].init.body).toContain(`code=${CODE.replace(/-/g, "-")}`);
  });
});

describe("session cookie", () => {
  const cookieAt = async () => cookieFrom(await handleCallback(callback(good), db, config(info({ verified_account: "true" })).c, NOW))!;
  const req = (cookie: string) => new Request("https://x", { headers: { cookie } });

  it("rejects tampering, the wrong secret, expiry, and a missing secret", async () => {
    const cookie = await cookieAt();
    expect(sessionSeller(req(cookie), SECRET, NOW)).toBe("seller-1");
    const [name, value] = cookie.split("=");
    const [seller, exp, sig] = value.split(".");
    const forged = `${name}=${Buffer.from("other-seller").toString("base64url")}.${exp}.${sig}`;
    expect(sessionSeller(req(forged), SECRET, NOW)).toBeNull();
    expect(sessionSeller(req(`${name}=${seller}.${Number(exp) + 9999}.${sig}`), SECRET, NOW)).toBeNull();
    expect(sessionSeller(req(cookie), "other-secret", NOW)).toBeNull();
    expect(sessionSeller(req(cookie), SECRET, new Date(NOW.getTime() + 9 * 3600_000))).toBeNull();
    expect(sessionSeller(req(cookie), undefined, NOW)).toBeNull();
    expect(sessionSeller(new Request("https://x"), SECRET, NOW)).toBeNull();
  });
});

it("checklist before any login asks the seller to connect", async () => {
  expect((await buildChecklist(db, "seller-1"))[0]).toMatchObject({ state: "todo", title: "Connect your PayPal account" });
});
