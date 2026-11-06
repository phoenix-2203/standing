import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { actions, shipments } from "@/db/schema";
import { approveAction, CANCEL_WINDOW_MS } from "@/lib/paypal/actions";
import { fakePayPal, json, testDb } from "@/test/helpers";
import { markCompleted, previewFix, sendFix, trackingPush } from "./fixes";

const SELLER = "seller-1";
const T0 = new Date("2026-11-05T10:00:00Z");
const DUE = new Date(T0.getTime() + CANCEL_WINDOW_MS);
const push = { sellerId: SELLER, orderId: "82T98686KK690340N", captureId: "7X271304DH7155231", trackingNumber: "9400111899223197428490", carrier: "USPS" };

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  await db.delete(actions);
  await db.delete(shipments);
});

describe("trackingPush", () => {
  it("builds the Orders v2 /track call with a stable request ID and a plain preview", () => {
    expect(trackingPush(push)).toEqual({
      sellerId: SELLER,
      type: "tracking_push",
      method: "POST",
      path: "/v2/checkout/orders/82T98686KK690340N/track",
      payload: { capture_id: "7X271304DH7155231", tracking_number: "9400111899223197428490", carrier: "USPS", notify_payer: false },
      requestId: "track-7X271304DH7155231-9400111899223197428490",
      summary: "Add tracking 9400111899223197428490 (USPS) to PayPal order 82T98686KK690340N, payment 7X271304DH7155231. The buyer is not emailed.",
    });
  });

  it("names the carrier for OTHER", () => {
    const s = trackingPush({ ...push, carrier: "OTHER", carrierNameOther: "GIG Logistics" });
    expect(s.payload).toMatchObject({ carrier: "OTHER", carrier_name_other: "GIG Logistics" });
    expect(s.summary).toContain("(GIG Logistics)");
  });

  it.each([
    [{ trackingNumber: "" }, /Tracking number/],
    [{ trackingNumber: "https://track.example/123" }, /Tracking number/],
    [{ trackingNumber: "x".repeat(65) }, /Tracking number/],
    [{ carrier: "usps" }, /carrier code/],
    [{ carrier: "OTHER" }, /needs the carrier's name/],
    [{ orderId: "../../v1/x" }, /PayPal IDs/],
  ])("rejects %j", (bad, msg) => {
    expect(() => trackingPush({ ...push, ...bad })).toThrow(msg);
  });
});

describe("markCompleted", () => {
  it("builds the trackers call with status COMPLETED and no tracking number, worded 'marks the order Completed'", () => {
    const s = markCompleted({ sellerId: SELLER, captureId: "3WJ00519L0856334T" });
    expect(s).toMatchObject({
      type: "digital_complete",
      method: "POST",
      path: "/v1/shipping/trackers",
      payload: { trackers: [{ transaction_id: "3WJ00519L0856334T", status: "COMPLETED" }] },
      requestId: "complete-3WJ00519L0856334T",
    });
    expect(s.summary).toMatch(/^Marks PayPal payment 3WJ00519L0856334T as Completed/);
    expect(s.summary).not.toMatch(/release|funds|hold/i);
  });
});

describe("sendFix", () => {
  it("after a successful push, records the tracker under PayPal's tracker ID", async () => {
    const spec = trackingPush(push);
    await previewFix(db, spec);
    await approveAction(db, spec.requestId, T0);
    const r = await sendFix(db, fakePayPal(() => json(201, { id: push.orderId })).client, SELLER, spec.requestId, DUE);
    expect(r.outcome).toBe("sent");
    expect(await db.select().from(shipments)).toMatchObject([
      { transactionId: push.captureId, trackerId: `${push.captureId}-${push.trackingNumber}`, trackingNumber: push.trackingNumber, carrier: "USPS", status: "SHIPPED", source: "standing_push" },
    ]);
  });

  it("records a COMPLETED tracker for the digital fix, and nothing when PayPal refuses", async () => {
    const ok = markCompleted({ sellerId: SELLER, captureId: "3WJ00519L0856334T" });
    await previewFix(db, ok);
    await approveAction(db, ok.requestId, T0);
    await sendFix(db, fakePayPal(() => json(201, { tracker_identifiers: [] })).client, SELLER, ok.requestId, DUE);

    const refused = markCompleted({ sellerId: SELLER, captureId: "7X271304DH7155231" });
    await previewFix(db, refused);
    await approveAction(db, refused.requestId, T0);
    const r = await sendFix(db, fakePayPal(() => json(400, { name: "VALIDATION_ERROR" })).client, SELLER, refused.requestId, DUE);
    expect(r.outcome).toBe("failed");

    expect(await db.select().from(shipments)).toMatchObject([{ trackerId: "3WJ00519L0856334T-NOTRACKER", status: "COMPLETED", trackingNumber: null }]);
  });
});
