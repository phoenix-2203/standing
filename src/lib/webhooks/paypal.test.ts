import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { fakePayPal, json, testDb } from "@/test/helpers";
import { handlePayPalWebhook } from "./paypal";

const WEBHOOK_ID = "WH-TEST-1";

const event = {
  id: "WH-58D329510W468432D-8HN650336L201105X",
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource_type: "capture",
  resource: { id: "1GB72668J97404239", status: "COMPLETED" },
};

function delivery(body: unknown = event, overrides: Record<string, string | null> = {}): Request {
  const headers: Record<string, string> = {};
  const base: Record<string, string | null> = {
    "paypal-transmission-id": "b2384410-f8d2-11ec-b939-0242ac120002",
    "paypal-transmission-time": "2026-10-31T12:00:00Z",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-a5cafa77",
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-transmission-sig": "c2lnbmF0dXJl",
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) if (v !== null) headers[k] = v;
  return new Request("http://localhost/api/webhooks/paypal", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const verifies = (status: "SUCCESS" | "FAILURE") => () => json(200, { verification_status: status }, "dbg-verify");

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  await db.delete(webhookEvents);
});

describe("PayPal webhook", () => {
  it("verifies the signature with PayPal, then stores the event", async () => {
    const pp = fakePayPal(verifies("SUCCESS"));
    const res = await handlePayPalWebhook(delivery(), { db, paypal: pp.client, webhookId: WEBHOOK_ID });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "stored", event_id: event.id });

    const [verify] = pp.apiCalls();
    expect(verify.path).toBe("/v1/notifications/verify-webhook-signature");
    expect(JSON.parse(verify.body!)).toEqual({
      auth_algo: "SHA256withRSA",
      cert_url: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-a5cafa77",
      transmission_id: "b2384410-f8d2-11ec-b939-0242ac120002",
      transmission_sig: "c2lnbmF0dXJl",
      transmission_time: "2026-10-31T12:00:00Z",
      webhook_id: WEBHOOK_ID,
      webhook_event: event,
    });

    const rows = await db.select().from(webhookEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ eventId: event.id, eventType: "PAYMENT.CAPTURE.COMPLETED", verifyDebugId: "dbg-verify" });
  });

  it("ignores a duplicate delivery of the same event", async () => {
    const pp = fakePayPal(verifies("SUCCESS"));
    const deps = { db, paypal: pp.client, webhookId: WEBHOOK_ID };
    await handlePayPalWebhook(delivery(), deps);
    const again = await handlePayPalWebhook(delivery(event, { "paypal-transmission-id": "retry-2" }), deps);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ status: "duplicate", event_id: event.id });
    expect(await db.select().from(webhookEvents)).toHaveLength(1);
  });

  it("rejects a bad signature and stores nothing", async () => {
    const pp = fakePayPal(verifies("FAILURE"));
    const res = await handlePayPalWebhook(delivery(), { db, paypal: pp.client, webhookId: WEBHOOK_ID });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "signature_rejected" });
    expect(await db.select().from(webhookEvents)).toHaveLength(0);
  });

  it("rejects missing signature headers without calling PayPal", async () => {
    const pp = fakePayPal(verifies("SUCCESS"));
    const res = await handlePayPalWebhook(delivery(event, { "paypal-transmission-sig": null }), {
      db,
      paypal: pp.client,
      webhookId: WEBHOOK_ID,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_signature_headers", missing: ["paypal-transmission-sig"] });
    expect(pp.calls).toHaveLength(0);
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["a non-event body", { hello: "world" }],
  ])("rejects %s without calling PayPal", async (_name, body) => {
    const pp = fakePayPal(verifies("SUCCESS"));
    const res = await handlePayPalWebhook(delivery(body), { db, paypal: pp.client, webhookId: WEBHOOK_ID });
    expect(res.status).toBe(400);
    expect(pp.calls).toHaveLength(0);
  });

  it("answers 503 (so PayPal redelivers) when verification can't be done", async () => {
    const down = fakePayPal(() => json(503, { name: "SERVICE_UNAVAILABLE" }));
    const res = await handlePayPalWebhook(delivery(), { db, paypal: down.client, webhookId: WEBHOOK_ID });
    expect(res.status).toBe(503);

    const timeout = fakePayPal(() => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const res2 = await handlePayPalWebhook(delivery(), { db, paypal: timeout.client, webhookId: WEBHOOK_ID });
    expect(res2.status).toBe(503);
    expect(await db.select().from(webhookEvents)).toHaveLength(0);
  });

  it("rejects (400) when PayPal refuses the verification request itself", async () => {
    // Seen against the real sandbox 31 Oct: webhook_id "WH-NOT-REAL" → 400 INVALID_REQUEST (debug f65133855b89f).
    const pp = fakePayPal(() => json(400, { name: "INVALID_REQUEST" }, "dbg-400"));
    const res = await handlePayPalWebhook(delivery(), { db, paypal: pp.client, webhookId: "WH-NOT-REAL" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "signature_unverifiable", debug_id: "dbg-400" });
    expect(await db.select().from(webhookEvents)).toHaveLength(0);
  });

  it("uses a fresh request ID per verification, so PayPal can't replay a cached SUCCESS", async () => {
    const pp = fakePayPal(verifies("SUCCESS"));
    const deps = { db, paypal: pp.client, webhookId: WEBHOOK_ID };
    await handlePayPalWebhook(delivery(), deps);
    await handlePayPalWebhook(delivery(), deps);
    const [a, b] = pp.apiCalls().map((c) => c.headers["paypal-request-id"]);
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
