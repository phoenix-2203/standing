import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { actions } from "@/db/schema";
import { fakePayPal, json, testDb } from "@/test/helpers";
import { type ActionSpec, approveAction, CANCEL_WINDOW_MS, cancelAction, previewAction, sendAction } from "./actions";

const track: ActionSpec = {
  type: "tracking_push",
  method: "POST",
  path: "/v2/checkout/orders/2V743103EU320351C/track",
  payload: { capture_id: "1GB72668J97404239", tracking_number: "STANDINGD1PHY01", carrier: "USPS" },
  requestId: "track-1GB72668J97404239-STANDINGD1PHY01",
  summary: "Add tracking STANDINGD1PHY01 (USPS) to PayPal order 2V743103EU320351C.",
};
const T0 = new Date("2026-11-05T10:00:00Z");
const after = (ms: number) => new Date(T0.getTime() + ms);
const DUE = after(CANCEL_WINDOW_MS);

/** Preview + approve at T0: due once the default window has passed. */
async function approved(spec = track) {
  await previewAction(db, spec);
  return approveAction(db, spec.requestId, T0);
}

// One PGlite instance per file (startup is the slow part); the table is emptied between tests.
let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  await db.delete(actions);
});

describe("preview → cancel window → send", () => {
  it("a preview holds the summary and the stable request ID; previewing again returns the same action", async () => {
    const a = await previewAction(db, track);
    expect(a).toMatchObject({ status: "preview", requestId: track.requestId, summary: track.summary, attempts: 0 });
    expect((await previewAction(db, track)).id).toBe(a.id);
    await expect(previewAction(db, { ...track, path: "/v1/shipping/trackers" })).rejects.toThrow(/different action/);
  });

  it("nothing is sent before approval or inside the cancel window", async () => {
    const pp = fakePayPal(() => json(201, {}));
    await previewAction(db, track);
    expect((await sendAction(db, pp.client, track.requestId, T0)).outcome).toBe("not_approved");
    const a = await approveAction(db, track.requestId, T0);
    expect(a).toMatchObject({ status: "scheduled", undoUntil: DUE });
    expect((await sendAction(db, pp.client, track.requestId, after(CANCEL_WINDOW_MS - 1))).outcome).toBe("in_window");
    expect(pp.apiCalls()).toHaveLength(0);
  });

  it("cancel inside the window → never sent", async () => {
    await approved();
    const pp = fakePayPal(() => json(201, {}));
    const c = await cancelAction(db, track.requestId, after(30_000));
    expect(c).toMatchObject({ cancelled: true, action: { status: "cancelled" } });
    expect((await sendAction(db, pp.client, track.requestId, after(10 * CANCEL_WINDOW_MS))).outcome).toBe("cancelled");
    expect(pp.apiCalls()).toHaveLength(0);
  });

  it("cancel after the window is refused, and the fix still goes", async () => {
    await approved();
    const c = await cancelAction(db, track.requestId, DUE);
    expect(c).toMatchObject({ cancelled: false, action: { status: "scheduled" } });
    const pp = fakePayPal(() => json(201, { id: "2V743103EU320351C" }));
    expect((await sendAction(db, pp.client, track.requestId, DUE)).outcome).toBe("sent");
  });

  it("can't cancel once sent", async () => {
    await approved();
    await sendAction(db, fakePayPal(() => json(201, {})).client, track.requestId, DUE);
    expect((await cancelAction(db, track.requestId, DUE)).cancelled).toBe(false);
  });
});

describe("sendAction", () => {
  it("sends the stored payload with the stable request ID and keeps PayPal's response", async () => {
    await approved();
    const pp = fakePayPal(() => json(201, { id: "2V743103EU320351C" }, "dbg-first"));
    const res = await sendAction(db, pp.client, track.requestId, DUE);
    expect(res).toMatchObject({ outcome: "sent", fromStore: false });
    expect(res.action).toMatchObject({ status: "sent", attempts: 1, paypalHttpStatus: 201, paypalDebugId: "dbg-first", paypalResponse: { id: "2V743103EU320351C" } });
    const sent = pp.apiCalls()[0];
    expect(sent.headers["paypal-request-id"]).toBe(track.requestId);
    expect(JSON.parse(sent.body!)).toEqual(track.payload);
  });

  it("double click → one PayPal call (concurrent sends: one claims, the other is told it's in flight)", async () => {
    await approved();
    const pp = fakePayPal(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return json(201, { id: "once" });
    });
    const results = await Promise.all([sendAction(db, pp.client, track.requestId, DUE), sendAction(db, pp.client, track.requestId, DUE)]);
    expect(pp.apiCalls()).toHaveLength(1);
    expect(results.map((r) => r.outcome).sort()).toEqual(["in_flight", "sent"]);
    // A later click answers from the store, still without calling PayPal.
    expect(await sendAction(db, pp.client, track.requestId, after(CANCEL_WINDOW_MS + 1000))).toMatchObject({ outcome: "sent", fromStore: true });
    expect(pp.apiCalls()).toHaveLength(1);
  });

  it("records a 4xx as failed, and a repeat doesn't resend it", async () => {
    await approved();
    const pp = fakePayPal(() => json(422, { name: "UNPROCESSABLE_ENTITY" }, "dbg-422"));
    expect(await sendAction(db, pp.client, track.requestId, DUE)).toMatchObject({ outcome: "failed", action: { status: "failed", paypalHttpStatus: 422 } });
    await sendAction(db, pp.client, track.requestId, DUE);
    expect(pp.apiCalls()).toHaveLength(1);
  });

  it("timeout → UNKNOWN (not failed); the retry reuses the request ID and the stored payload", async () => {
    await approved();
    let fail = true;
    const pp = fakePayPal(() => {
      if (fail) {
        fail = false;
        throw new DOMException("The operation timed out.", "TimeoutError");
      }
      return json(201, { id: "late" }, "dbg-late");
    });
    const first = await sendAction(db, pp.client, track.requestId, DUE);
    expect(first).toMatchObject({ outcome: "unknown", action: { status: "unknown", paypalHttpStatus: null } });
    const retry = await sendAction(db, pp.client, track.requestId, after(CANCEL_WINDOW_MS + 60_000));
    expect(retry).toMatchObject({ outcome: "sent", action: { status: "sent", attempts: 2, paypalDebugId: "dbg-late" } });
    const [a, b] = pp.apiCalls();
    expect(b.headers["paypal-request-id"]).toBe(a.headers["paypal-request-id"]);
    expect(b.body).toBe(a.body);
  });

  it("5xx → UNKNOWN and not locked in as the first response", async () => {
    await approved();
    let first = true;
    const pp = fakePayPal(() => {
      if (first) {
        first = false;
        return json(500, { name: "INTERNAL_SERVER_ERROR" }, "dbg-500");
      }
      return json(201, { id: "ok" }, "dbg-ok");
    });
    expect(await sendAction(db, pp.client, track.requestId, DUE)).toMatchObject({ outcome: "unknown", action: { lastError: "HTTP 500 (debug dbg-500)" } });
    expect(await sendAction(db, pp.client, track.requestId, DUE)).toMatchObject({ outcome: "sent", action: { paypalHttpStatus: 201 } });
  });

  it("a send stuck mid-call (process died) can be reclaimed after 5 minutes, with the same request ID", async () => {
    await approved();
    await db.update(actions).set({ status: "sending", updatedAt: DUE });
    const pp = fakePayPal(() => json(201, {}));
    expect((await sendAction(db, pp.client, track.requestId, after(CANCEL_WINDOW_MS + 60_000))).outcome).toBe("in_flight");
    expect((await sendAction(db, pp.client, track.requestId, after(CANCEL_WINDOW_MS + 6 * 60_000))).outcome).toBe("sent");
    expect(pp.apiCalls()[0].headers["paypal-request-id"]).toBe(track.requestId);
  });
});
