import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { actions, products, shipments, shopOrders, transactionItems, transactions } from "@/db/schema";
import { approveAction, cancelAction, CANCEL_WINDOW_MS } from "@/lib/paypal/actions";
import { recordShopOrder } from "@/lib/shop/orders";
import { upsertTransaction } from "@/lib/sync/transactions";
import { fakePayPal, json, testDb } from "@/test/helpers";
import { saveProduct } from "@/lib/catalogue/catalogue";
import { markCompleted, previewFix, sendDueFixes, sendFix } from "./fixes";
import { addTracking, InvalidTracking, listTrackingGaps, NotATrackingGap } from "./tracking";

const SELLER = "seller-1";
const NOW = new Date("2026-11-08T12:00:00Z");
const DUE = new Date(NOW.getTime() + CANCEL_WINDOW_MS);
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const GOOD = { trackingNumber: "TEST-123", carrier: "USPS" };

async function sale(id: string, item: string, at = hoursAgo(72), seller = SELLER) {
  await upsertTransaction(db, seller, {
    transaction_info: { transaction_id: id, transaction_event_code: "T0006", transaction_status: "S", transaction_initiation_date: at, transaction_amount: { currency_code: "USD", value: "20.00" } },
    cart_info: { item_details: [{ item_name: item }] },
  });
}

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  for (const t of [actions, shipments, shopOrders, transactionItems, transactions, products]) await db.delete(t);
  await saveProduct(db, SELLER, { name: "Candle", kind: "physical" });
  await saveProduct(db, SELLER, { name: "Pattern", kind: "digital" });
});

describe("listTrackingGaps", () => {
  it("lists only this seller's physical orders with no tracking, oldest first, flagging those over 48 hours", async () => {
    await sale("NEW", "Candle", hoursAgo(5));
    await sale("OLD", "Candle", hoursAgo(72));
    await sale("DIG", "Pattern");
    await sale("UNKNOWN", "Mystery");
    await sale("THEIRS", "Candle", hoursAgo(72), "seller-2");
    const gaps = await listTrackingGaps(db, SELLER, NOW);
    expect(gaps.map((g) => [g.transactionId, g.overdue])).toEqual([["OLD", true], ["NEW", false]]);
  });
});

describe("addTracking", () => {
  it("queues the seller's number with a cancel window and makes no PayPal call until it ends", async () => {
    await sale("CAP1", "Candle");
    const a = await addTracking(db, SELLER, "CAP1", { trackingNumber: " TEST-123 ", carrier: "USPS" }, NOW);
    expect(a).toMatchObject({ status: "scheduled", requestId: "track-CAP1-TEST-123", undoUntil: DUE });
    expect(a.summary).toContain("TEST-123");
    expect(a.summary).toContain("not emailed");
    const pp = fakePayPal(() => json(201, {}));
    expect(await sendDueFixes(db, pp.client, SELLER, new Date(NOW.getTime() + 1000))).toEqual([]);
    expect(pp.apiCalls()).toHaveLength(0);
  });

  it("with no known order ID, sends through /v1/shipping/trackers once, and the order leaves the list", async () => {
    await sale("CAP1", "Candle");
    await addTracking(db, SELLER, "CAP1", GOOD, NOW);
    const pp = fakePayPal(() => json(201, { tracker_identifiers: [] }, "dbg-track"));
    const [r] = await sendDueFixes(db, pp.client, SELLER, DUE);
    expect(r).toMatchObject({ outcome: "sent", action: { paypalDebugId: "dbg-track" } });
    expect(pp.apiCalls()).toHaveLength(1);
    expect(pp.apiCalls()[0].path).toContain("/v1/shipping/trackers");
    expect(JSON.parse(pp.apiCalls()[0].body!)).toEqual({ trackers: [{ transaction_id: "CAP1", tracking_number: "TEST-123", status: "SHIPPED", carrier: "USPS", notify_buyer: false }] });
    expect(pp.apiCalls()[0].headers["paypal-request-id"]).toBe("track-CAP1-TEST-123");
    expect(await listTrackingGaps(db, SELLER, DUE)).toEqual([]);
    expect(await db.select().from(shipments)).toMatchObject([{ transactionId: "CAP1", trackingNumber: "TEST-123", carrier: "USPS", status: "SHIPPED" }]);
  });

  it("with a demo-shop order ID, uses Orders v2", async () => {
    await sale("CAP1", "Candle");
    await recordShopOrder(db, SELLER, { id: "ORDER1", purchase_units: [{ items: [{ category: "PHYSICAL_GOODS" }], payments: { captures: [{ id: "CAP1" }] } }] });
    await addTracking(db, SELLER, "CAP1", GOOD, NOW);
    const pp = fakePayPal(() => json(201, {}));
    await sendDueFixes(db, pp.client, SELLER, DUE);
    expect(pp.apiCalls()[0].path).toContain("/v2/checkout/orders/ORDER1/track");
    expect(await listTrackingGaps(db, SELLER, DUE)).toEqual([]);
  });

  it("a timeout stays unknown and retries with the same request ID", async () => {
    await sale("CAP1", "Candle");
    await addTracking(db, SELLER, "CAP1", GOOD, NOW);
    const fail = fakePayPal(() => json(503, {}));
    expect((await sendDueFixes(db, fail.client, SELLER, DUE))[0].outcome).toBe("unknown");
    expect((await listTrackingGaps(db, SELLER, DUE))[0].fix?.status).toBe("unknown");
    const ok = fakePayPal(() => json(201, {}));
    expect((await sendDueFixes(db, ok.client, SELLER, DUE))[0].outcome).toBe("sent");
    expect(ok.apiCalls()[0].headers["paypal-request-id"]).toBe("track-CAP1-TEST-123");
  });

  it.each([
    [{ trackingNumber: "", carrier: "USPS" }, /Tracking number/],
    [{ trackingNumber: "bad number!", carrier: "USPS" }, /Tracking number/],
    [{ trackingNumber: 123, carrier: "USPS" }, /Tracking number/],
    [{ trackingNumber: "T1", carrier: "" }, /Carrier/],
    [{ trackingNumber: "T1", carrier: "OTHER" }, /carrier's name/],
  ])("refuses %j, and nothing is queued", async (input, message) => {
    await sale("CAP1", "Candle");
    const err = await addTracking(db, SELLER, "CAP1", input, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidTracking);
    expect(err.message).toMatch(message);
    expect(await db.select().from(actions)).toHaveLength(0);
  });

  it("refuses an order that isn't on this seller's list", async () => {
    await sale("DIG", "Pattern");
    await sale("THEIRS", "Candle", hoursAgo(72), "seller-2");
    await expect(addTracking(db, SELLER, "DIG", GOOD, NOW)).rejects.toBeInstanceOf(NotATrackingGap);
    await expect(addTracking(db, SELLER, "THEIRS", GOOD, NOW)).rejects.toBeInstanceOf(NotATrackingGap);
    await expect(addTracking(db, SELLER, "NOPE", GOOD, NOW)).rejects.toBeInstanceOf(NotATrackingGap);
  });

  it("a double click keeps one action and one window", async () => {
    await sale("CAP1", "Candle");
    await addTracking(db, SELLER, "CAP1", GOOD, NOW);
    const again = await addTracking(db, SELLER, "CAP1", GOOD, new Date(NOW.getTime() + 60_000));
    expect(again.undoUntil).toEqual(DUE);
    expect(await db.select().from(actions)).toHaveLength(1);
  });

  it("won't queue a second number while one is waiting, but will after a cancel, and the cancelled one is never sent", async () => {
    await sale("CAP1", "Candle");
    await addTracking(db, SELLER, "CAP1", GOOD, NOW);
    await expect(addTracking(db, SELLER, "CAP1", { trackingNumber: "OTHER-9", carrier: "UPS" }, NOW)).rejects.toThrow(/already queued/);
    await cancelAction(db, "track-CAP1-TEST-123", new Date(NOW.getTime() + 1000));
    await addTracking(db, SELLER, "CAP1", { trackingNumber: "OTHER-9", carrier: "UPS" }, new Date(NOW.getTime() + 2000));
    const pp = fakePayPal(() => json(201, {}));
    await sendDueFixes(db, pp.client, SELLER, new Date(NOW.getTime() + CANCEL_WINDOW_MS + 3000));
    expect(pp.apiCalls()).toHaveLength(1);
    expect(pp.apiCalls()[0].body).toContain("OTHER-9");
    expect(pp.apiCalls()[0].body).not.toContain("TEST-123");
  });

  describe("a retry after a lost answer gets 400 DUPLICATE_TRACKER, as the sandbox does on this route", () => {
    const duplicate = json(400, { errors: [{ name: "DUPLICATE_TRACKER", details: [{ issue: "TRACKING_NUMBER_ALREADY_EXIST" }] }] }, "dbg-dup");
    const respond = (trackers: unknown) =>
      fakePayPal((call) => (call.method === "GET" ? json(200, { trackers }, "dbg-back") : duplicate.clone()));

    beforeEach(async () => {
      await sale("CAP1", "Candle");
      await addTracking(db, SELLER, "CAP1", GOOD, NOW);
      expect((await sendDueFixes(db, fakePayPal(() => json(503, {})).client, SELLER, DUE))[0].outcome).toBe("unknown");
    });

    it("the tracker is in PayPal → sent, recorded, and off the list", async () => {
      const pp = respond([{ tracking_number: "TEST-123", status: "SHIPPED" }]);
      const [r] = await sendDueFixes(db, pp.client, SELLER, DUE);
      expect(r).toMatchObject({ outcome: "sent", action: { status: "sent", paypalHttpStatus: 400 } });
      expect(await listTrackingGaps(db, SELLER, DUE)).toEqual([]);
      expect(await db.select().from(shipments)).toHaveLength(1);
      expect(await sendDueFixes(db, pp.client, SELLER, DUE)).toEqual([]);
    });

    it("a different number is there, not ours → still unknown, never claimed as sent", async () => {
      const [r] = await sendDueFixes(db, respond([{ tracking_number: "SOMEONE-ELSE", status: "SHIPPED" }]).client, SELLER, DUE);
      expect(r).toMatchObject({ outcome: "unknown", action: { status: "unknown" } });
      expect(await db.select().from(shipments)).toHaveLength(0);
    });

    it("the read-back fails → still unknown", async () => {
      const pp = fakePayPal((call) => {
        if (call.method === "GET") throw new Error("network down");
        return duplicate.clone();
      });
      expect((await sendDueFixes(db, pp.client, SELLER, DUE))[0]).toMatchObject({ outcome: "unknown" });
    });
  });

  describe("Completed replayed: PayPal answers 400 INVALID_TRACKING_NUMBER", () => {
    const refused = () => json(400, { errors: [{ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INVALID_TRACKING_NUMBER" }] }] });
    async function send(trackers: unknown) {
      const spec = markCompleted({ sellerId: SELLER, captureId: "CAP9" });
      await previewFix(db, spec);
      await approveAction(db, spec.requestId, NOW);
      return sendFix(db, fakePayPal((call) => (call.method === "GET" ? json(200, { trackers }) : refused())).client, SELLER, spec.requestId, DUE);
    }

    it("Completed is in PayPal → sent", async () => {
      expect((await send([{ status: "COMPLETED" }])).outcome).toBe("sent");
    });

    it("the order has a tracking number but isn't Completed → a real refusal, no retry loop", async () => {
      expect(await send([{ tracking_number: "T1", status: "SHIPPED" }])).toMatchObject({ outcome: "failed", action: { status: "failed" } });
    });
  });

  it("any other refusal stays failed, with no read-back", async () => {
    await sale("CAP1", "Candle");
    await addTracking(db, SELLER, "CAP1", GOOD, NOW);
    const pp = fakePayPal(() => json(400, { errors: [{ name: "VALIDATION_ERROR" }] }));
    expect((await sendDueFixes(db, pp.client, SELLER, DUE))[0].outcome).toBe("failed");
    expect(pp.apiCalls().filter((c) => c.method === "GET")).toHaveLength(0);
  });

  it("PayPal's refusal is stored and the seller can try another number", async () => {
    await sale("CAP1", "Candle");
    await addTracking(db, SELLER, "CAP1", GOOD, NOW);
    const refused = fakePayPal(() => json(422, { name: "UNPROCESSABLE_ENTITY" }));
    expect((await sendDueFixes(db, refused.client, SELLER, DUE))[0].outcome).toBe("failed");
    expect((await listTrackingGaps(db, SELLER, DUE))[0].fix?.status).toBe("failed");
    expect((await addTracking(db, SELLER, "CAP1", { trackingNumber: "RIGHT-1", carrier: "USPS" }, DUE)).status).toBe("scheduled");
  });
});
