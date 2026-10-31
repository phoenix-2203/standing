import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { actions } from "@/db/schema";
import { fakePayPal, json, testDb } from "@/test/helpers";
import { sendAction, type ActionSpec } from "./actions";

const track: ActionSpec = {
  type: "tracking_push",
  method: "POST",
  path: "/v2/checkout/orders/2V743103EU320351C/track",
  payload: { capture_id: "1GB72668J97404239", tracking_number: "STANDINGD1PHY01", carrier: "USPS" },
  requestId: "standing-d1-phy-01-track",
};

// One PGlite instance per file (startup is the slow part); the table is emptied between tests.
let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  await db.delete(actions);
});

describe("sendAction", () => {
  it("sends once and stores PayPal's response", async () => {
    const pp = fakePayPal(() => json(201, { id: "2V743103EU320351C" }, "dbg-first"));
    const res = await sendAction(db, pp.client, track);
    expect(res).toMatchObject({ outcome: "sent", fromStore: false });
    expect(res.action).toMatchObject({
      status: "sent",
      attempts: 1,
      paypalHttpStatus: 201,
      paypalDebugId: "dbg-first",
      paypalResponse: { id: "2V743103EU320351C" },
    });
    const sent = pp.apiCalls()[0];
    expect(sent.headers["paypal-request-id"]).toBe(track.requestId);
    expect(JSON.parse(sent.body!)).toEqual(track.payload);
  });

  it("answers a repeat from the store without calling PayPal (double click → one call)", async () => {
    const pp = fakePayPal(() => json(201, { id: "first" }, "dbg-first"));
    await sendAction(db, pp.client, track);
    const again = await sendAction(db, pp.client, track);
    expect(again).toMatchObject({ outcome: "sent", fromStore: true });
    expect(again.action.paypalResponse).toEqual({ id: "first" });
    expect(pp.apiCalls()).toHaveLength(1);
  });

  it("keeps the first response when concurrent sends get different answers", async () => {
    // Mirrors day-1 test 2: a replay with the same request ID returned 422 instead of the original.
    let n = 0;
    const pp = fakePayPal(async () => {
      n += 1;
      const mine = n;
      await new Promise((r) => setTimeout(r, mine === 1 ? 5 : 30));
      return mine === 1 ? json(201, { id: "original" }, "dbg-1") : json(422, { name: "TRANSACTION_REFUSED" }, "dbg-2");
    });
    const [a, b] = await Promise.all([sendAction(db, pp.client, track), sendAction(db, pp.client, track)]);
    const [row] = await db.select().from(actions);
    expect(row).toMatchObject({ status: "sent", paypalHttpStatus: 201, paypalDebugId: "dbg-1", paypalResponse: { id: "original" } });
    expect([a.outcome, b.outcome]).toEqual(["sent", "sent"]);
  });

  it("records a 4xx as failed, and a repeat doesn't resend it", async () => {
    const pp = fakePayPal(() => json(422, { name: "UNPROCESSABLE_ENTITY" }, "dbg-422"));
    const res = await sendAction(db, pp.client, track);
    expect(res).toMatchObject({ outcome: "failed", action: { status: "failed", paypalHttpStatus: 422 } });
    await sendAction(db, pp.client, track);
    expect(pp.apiCalls()).toHaveLength(1);
  });

  it("marks a timeout UNKNOWN (not failed), then retries with the same request ID and payload", async () => {
    let fail = true;
    const pp = fakePayPal(() => {
      if (fail) {
        fail = false;
        throw new DOMException("The operation timed out.", "TimeoutError");
      }
      return json(201, { id: "late" }, "dbg-late");
    });
    const first = await sendAction(db, pp.client, track);
    expect(first).toMatchObject({ outcome: "unknown", action: { status: "unknown", paypalHttpStatus: null } });

    const retry = await sendAction(db, pp.client, { ...track, payload: { changed: true } });
    expect(retry).toMatchObject({ outcome: "sent", action: { status: "sent", attempts: 2, paypalDebugId: "dbg-late" } });
    const [a, b] = pp.apiCalls();
    expect(b.headers["paypal-request-id"]).toBe(a.headers["paypal-request-id"]);
    expect(b.body).toBe(a.body); // the stored payload is resent, not the caller's new one
  });

  it("treats a 5xx as UNKNOWN and doesn't lock it in as the first response", async () => {
    let first = true;
    const pp = fakePayPal(() => {
      if (first) {
        first = false;
        return json(500, { name: "INTERNAL_SERVER_ERROR" }, "dbg-500");
      }
      return json(201, { id: "ok" }, "dbg-ok");
    });
    const a = await sendAction(db, pp.client, track);
    expect(a).toMatchObject({ outcome: "unknown", action: { lastError: "HTTP 500 (debug dbg-500)" } });
    const b = await sendAction(db, pp.client, track);
    expect(b).toMatchObject({ outcome: "sent", action: { paypalHttpStatus: 201 } });
  });

  it("refuses to reuse a request ID for a different action", async () => {
    const pp = fakePayPal(() => json(201, {}));
    await sendAction(db, pp.client, track);
    await expect(sendAction(db, pp.client, { ...track, path: "/v1/shipping/trackers" })).rejects.toThrow(/different action/);
  });

  it("never sends a cancelled action", async () => {
    await db.insert(actions).values({ ...track, status: "cancelled" });
    const pp = fakePayPal(() => json(201, {}));
    const res = await sendAction(db, pp.client, track);
    expect(res.outcome).toBe("cancelled");
    expect(pp.apiCalls()).toHaveLength(0);
  });
});

