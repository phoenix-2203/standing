import { describe, expect, it } from "vitest";
import { fakePayPal, json } from "@/test/helpers";
import { assertSandbox, PayPalAuthError, PayPalClient, PayPalUnknownOutcome, SANDBOX_BASE } from "./client";

const creds = { clientId: "id", clientSecret: "secret" };

describe("sandbox guard", () => {
  it("accepts the sandbox base, with or without a trailing slash", () => {
    expect(assertSandbox(SANDBOX_BASE)).toBe(SANDBOX_BASE);
    expect(assertSandbox(`${SANDBOX_BASE}/`)).toBe(SANDBOX_BASE);
  });

  it.each([
    "https://api-m.paypal.com",
    "https://api.paypal.com",
    "https://api-m.sandbox.paypal.com.evil.example",
    "http://api-m.sandbox.paypal.com",
    "",
  ])("refuses %j", (base) => {
    expect(() => new PayPalClient({ baseUrl: base, ...creds })).toThrow(/only https:\/\/api-m\.sandbox\.paypal\.com/);
  });
});

describe("request IDs", () => {
  it("refuses a write without a request ID and makes no call", async () => {
    const pp = fakePayPal(() => json(201, {}));
    await expect(pp.client.request("POST", "/v2/checkout/orders", { body: {} })).rejects.toThrow(/stable requestId/);
    expect(pp.calls).toHaveLength(0);
  });

  it("sends the caller's request ID unchanged on writes", async () => {
    const pp = fakePayPal(() => json(201, { id: "X" }));
    await pp.client.request("POST", "/v2/checkout/orders", { body: {}, requestId: "create-d1-phy-01" });
    await pp.client.request("POST", "/v2/checkout/orders", { body: {}, requestId: "create-d1-phy-01" });
    expect(pp.apiCalls().map((c) => c.headers["paypal-request-id"])).toEqual(["create-d1-phy-01", "create-d1-phy-01"]);
  });

  it("lets GETs go without a request ID", async () => {
    const pp = fakePayPal(() => json(200, { status: "COMPLETED" }, "dbg-1"));
    const res = await pp.client.request("GET", "/v2/checkout/orders/X");
    expect(res).toEqual({ status: 200, body: { status: "COMPLETED" }, debugId: "dbg-1" });
    expect(pp.apiCalls()[0].headers["paypal-request-id"]).toBeUndefined();
  });
});

describe("token cache", () => {
  it("reuses one token across calls, including concurrent ones", async () => {
    const pp = fakePayPal(() => json(200, {}));
    await Promise.all([pp.client.request("GET", "/a"), pp.client.request("GET", "/b")]);
    await pp.client.request("GET", "/c");
    expect(pp.tokenRequests()).toBe(1);
    expect(pp.apiCalls().every((c) => c.headers.authorization === "Bearer token-1")).toBe(true);
  });

  it("refreshes a minute before expiry", async () => {
    let now = 0;
    const pp = fakePayPal(() => json(200, {}), { expiresIn: 3600, now: () => now });
    await pp.client.request("GET", "/a");
    now = 3600_000 - 61_000;
    await pp.client.request("GET", "/a");
    expect(pp.tokenRequests()).toBe(1);
    now = 3600_000 - 59_000;
    await pp.client.request("GET", "/a");
    expect(pp.tokenRequests()).toBe(2);
  });

  it("retries once with a fresh token after a 401, keeping the request ID", async () => {
    let first = true;
    const pp = fakePayPal(() => {
      if (first) {
        first = false;
        return json(401, { error: "invalid_token" });
      }
      return json(201, { id: "X" });
    });
    const res = await pp.client.request("POST", "/v2/checkout/orders", { body: {}, requestId: "r1" });
    expect(res.status).toBe(201);
    expect(pp.tokenRequests()).toBe(2);
    expect(pp.apiCalls().map((c) => c.headers["paypal-request-id"])).toEqual(["r1", "r1"]);
  });

  it("reports a failed token request without leaking credentials", async () => {
    const fetch = (async () => new Response("{}", { status: 401, headers: { "paypal-debug-id": "dbg-auth" } })) as typeof globalThis.fetch;
    const client = new PayPalClient({ baseUrl: SANDBOX_BASE, clientId: "my-id", clientSecret: "my-secret", fetch });
    const err = await client.request("GET", "/a").catch((e) => e);
    expect(err).toBeInstanceOf(PayPalAuthError);
    expect(err.message).toContain("dbg-auth");
    expect(err.message).not.toMatch(/my-id|my-secret|bXktaWQ/);
  });
});

describe("unknown outcomes", () => {
  it("turns a network failure into PayPalUnknownOutcome, not a failure", async () => {
    const pp = fakePayPal(() => {
      throw new TypeError("fetch failed");
    });
    const err = await pp.client.request("POST", "/v1/shipping/trackers", { body: {}, requestId: "r1" }).catch((e) => e);
    expect(err).toBeInstanceOf(PayPalUnknownOutcome);
    expect(err.requestId).toBe("r1");
  });
});
