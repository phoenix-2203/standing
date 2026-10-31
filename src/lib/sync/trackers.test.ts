import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { shipments, syncState, transactionItems, transactions } from "@/db/schema";
import { type Call, fakePayPal, json, testDb } from "@/test/helpers";
import { HOUR } from "./state";
import { syncTrackers, TRACKERS_PER_RUN } from "./trackers";
import { upsertTransaction } from "./transactions";

const SELLER = "seller-1";
const NOW = new Date("2026-11-03T12:00:00Z");

const sale = (id: string, at = "2026-11-01T10:00:00Z", value = "20.00", code = "T0006") =>
  upsertTransaction(db, SELLER, {
    transaction_info: {
      transaction_id: id,
      transaction_event_code: code,
      transaction_status: "S",
      transaction_initiation_date: at,
      transaction_amount: { currency_code: "USD", value },
    },
  });

const self = (id: string) => [{ rel: "self", href: `https://api-m.sandbox.paypal.com/v1/shipping/trackers/${id}` }];

// Real shapes from GET /v1/shipping/trackers on 31 Oct (debug f884385462718, f539345a5a445, f53934520fdc3).
const REAL: Record<string, object> = {
  "1GB72668J97404239": {
    trackers: [
      { transaction_id: "1GB72668J97404239", tracking_number: "STANDINGD1PHY01", status: "SHIPPED", carrier: "USPS", links: self("1GB72668J97404239-STANDINGD1PHY01") },
    ],
  },
  "7X271304DH7155231": { trackers: [], links: [] },
  "3WJ00519L0856334T": { trackers: [{ transaction_id: "3WJ00519L0856334T", status: "COMPLETED", links: self("3WJ00519L0856334T-NOTRACKER") }] },
};
const txnOf = (c: Call) => new URL(`https://x${c.path}`).searchParams.get("transaction_id")!;
const paypalWithReal = () => fakePayPal((c) => json(200, REAL[txnOf(c)] ?? { trackers: [] }));

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  for (const t of [shipments, transactionItems, transactions, syncState]) await db.delete(t);
});

describe("syncTrackers", () => {
  it("stores PayPal's trackers, including Orders v2 /track ones and a digital COMPLETED with no tracking number", async () => {
    for (const id of Object.keys(REAL)) await sale(id);
    const pp = paypalWithReal();
    const report = await syncTrackers(db, pp.client, SELLER, NOW);

    expect(report).toMatchObject({ ok: true, requests: 3, upserted: 2 });
    const rows = await db.select().from(shipments);
    expect(rows.map(({ trackerId, transactionId, trackingNumber, carrier, status, source }) => ({ trackerId, transactionId, trackingNumber, carrier, status, source })).sort((a, b) => a.trackerId!.localeCompare(b.trackerId!))).toEqual([
      { trackerId: "1GB72668J97404239-STANDINGD1PHY01", transactionId: "1GB72668J97404239", trackingNumber: "STANDINGD1PHY01", carrier: "USPS", status: "SHIPPED", source: "paypal_read" },
      { trackerId: "3WJ00519L0856334T-NOTRACKER", transactionId: "3WJ00519L0856334T", trackingNumber: null, carrier: null, status: "COMPLETED", source: "paypal_read" },
    ]);
  });

  it("stops asking about settled sales and waits 6 h before re-checking the rest", async () => {
    for (const id of Object.keys(REAL)) await sale(id);
    const pp = paypalWithReal();
    await syncTrackers(db, pp.client, SELLER, NOW);

    await syncTrackers(db, pp.client, SELLER, new Date(NOW.getTime() + HOUR));
    expect(pp.apiCalls()).toHaveLength(3); // nothing due an hour later

    await syncTrackers(db, pp.client, SELLER, new Date(NOW.getTime() + 6 * HOUR + 1));
    expect(pp.apiCalls().slice(3).map(txnOf)).toEqual(["7X271304DH7155231"]); // only the one without tracking
  });

  it("updates a tracker in place when its status changes (e.g. cancelled), and then re-checks that sale", async () => {
    await sale("1GB72668J97404239");
    let status = "SHIPPED";
    const pp = fakePayPal(() =>
      json(200, { trackers: [{ transaction_id: "1GB72668J97404239", tracking_number: "STANDINGD1PHY01", status, carrier: "USPS", links: self("1GB72668J97404239-STANDINGD1PHY01") }] }),
    );
    await syncTrackers(db, pp.client, SELLER, NOW);
    // Simulate the tracker being cancelled in PayPal, then a re-check after 6 h.
    await db.update(shipments).set({ status: "CANCELLED" });
    status = "CANCELLED";
    await syncTrackers(db, pp.client, SELLER, new Date(NOW.getTime() + 7 * HOUR));
    const rows = await db.select().from(shipments);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("CANCELLED");
    expect(pp.apiCalls()).toHaveLength(2);
  });

  it("only checks sales from the last 90 days, never refunds or other sellers", async () => {
    await sale("RECENT");
    await sale("OLD", "2026-07-01T00:00:00Z");
    await sale("REFUND", "2026-11-01T00:00:00Z", "-20.00", "T1107");
    await upsertTransaction(db, "other-seller", {
      transaction_info: {
        transaction_id: "OTHER",
        transaction_event_code: "T0006",
        transaction_status: "S",
        transaction_initiation_date: "2026-11-01T00:00:00Z",
        transaction_amount: { currency_code: "USD", value: "5.00" },
      },
    });
    const pp = paypalWithReal();
    await syncTrackers(db, pp.client, SELLER, NOW);
    expect(pp.apiCalls().map(txnOf)).toEqual(["RECENT"]);
  });

  it(`checks at most ${TRACKERS_PER_RUN} sales per run, never-checked first`, async () => {
    for (let i = 0; i < TRACKERS_PER_RUN + 5; i++) await sale(`T${String(i).padStart(3, "0")}`);
    const pp = paypalWithReal();
    await syncTrackers(db, pp.client, SELLER, NOW);
    expect(pp.apiCalls()).toHaveLength(TRACKERS_PER_RUN);
    await syncTrackers(db, pp.client, SELLER, new Date(NOW.getTime() + 15 * 60_000));
    expect(pp.apiCalls()).toHaveLength(TRACKERS_PER_RUN + 5); // the 5 left over, not the ones just checked
  });

  it("on an error, records the debug ID and doesn't mark the sale as checked", async () => {
    await sale("1GB72668J97404239");
    const pp = fakePayPal(() => json(500, { name: "INTERNAL_SERVER_ERROR" }, "dbg-trk-500"));
    const report = await syncTrackers(db, pp.client, SELLER, NOW);
    expect(report).toMatchObject({ ok: false, debugId: "dbg-trk-500" });
    const [t] = await db.select().from(transactions).where(eq(transactions.transactionId, "1GB72668J97404239"));
    expect(t.trackersCheckedAt).toBeNull();
  });
});
