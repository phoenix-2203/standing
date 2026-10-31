import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { disputes, syncState, transactionItems, transactions } from "@/db/schema";
import { type Call, fakePayPal, json, testDb } from "@/test/helpers";
import { syncDisputes } from "./disputes";
import { DAY, HOUR } from "./state";
import { syncTransactions, type TxnDetail } from "./transactions";

const SELLER = "seller-1";
const NOW = new Date("2026-11-03T12:00:00Z");

function txn(id: string, at: string, value: string, extra: Partial<TxnDetail["transaction_info"]> = {}, items?: object[]): TxnDetail {
  return {
    transaction_info: {
      transaction_id: id,
      transaction_event_code: "T0006",
      transaction_status: "S",
      transaction_initiation_date: at,
      transaction_amount: { currency_code: "USD", value },
      ...extra,
    },
    cart_info: items ? { item_details: items as never } : {},
  };
}

function query(call: Call) {
  return Object.fromEntries(new URL(`https://x${call.path}`).searchParams);
}

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  await db.delete(transactionItems);
  await db.delete(transactions);
  await db.delete(disputes);
  await db.delete(syncState);
});

describe("syncTransactions", () => {
  it("backfills 90 days in ≤31-day windows and stops the cursor at PayPal's last refresh", async () => {
    const pp = fakePayPal(() =>
      json(200, { transaction_details: [], page: 1, total_pages: 1, last_refreshed_datetime: "2026-11-03T09:30:00Z" }),
    );

    const report = await syncTransactions(db, pp.client, SELLER, NOW);

    const windows = pp.apiCalls().map((c) => [query(c).start_date, query(c).end_date]);
    expect(windows).toEqual([
      ["2026-08-05T12:00:00Z", "2026-09-05T12:00:00Z"],
      ["2026-09-05T12:00:00Z", "2026-10-06T12:00:00Z"],
      ["2026-10-06T12:00:00Z", "2026-11-03T12:00:00Z"],
    ]);
    expect(pp.apiCalls().every((c) => query(c).fields === "all")).toBe(true);
    expect(report).toMatchObject({ ok: true, requests: 3, syncedThrough: new Date("2026-11-03T09:30:00Z") });
  });

  it("stores amounts as exact decimals and keeps line items", async () => {
    const pp = fakePayPal(() =>
      json(200, {
        transaction_details: [
          txn("TX1", "2026-11-01T10:00:00Z", "18.10", {}, [
            { item_name: "Lavender candle", item_code: "CANDLE-LAV", item_quantity: "2", item_unit_price: { currency_code: "USD", value: "9.05" } },
          ]),
        ],
        total_pages: 1,
      }),
    );
    await syncTransactions(db, pp.client, SELLER, NOW);
    const [row] = await db.select().from(transactions);
    expect(row).toMatchObject({ transactionId: "TX1", sellerId: SELLER, eventCode: "T0006", amount: "18.10", currency: "USD" });
    expect(await db.select().from(transactionItems)).toMatchObject([
      { transactionId: "TX1", position: 0, name: "Lavender candle", sku: "CANDLE-LAV", quantity: 2, unitAmount: "9.05" },
    ]);
  });

  it("follows pages", async () => {
    const pp = fakePayPal((call) => {
      const page = Number(query(call).page);
      return json(200, { transaction_details: [txn(`TX${page}`, "2026-11-01T10:00:00Z", "5.00")], page, total_pages: 2 });
    });
    await syncTransactions(db, pp.client, SELLER, new Date("2026-11-03T12:00:00Z"));
    expect(pp.apiCalls().map((c) => query(c).page)).toEqual(["1", "2", "1", "2", "1", "2"]);
    expect(await db.select().from(transactions)).toHaveLength(2);
  });

  it("resumes 3 h before the cursor and updates rows in place", async () => {
    let status = "P";
    const pp = fakePayPal(() =>
      json(200, { transaction_details: [txn("TX1", "2026-11-03T08:00:00Z", "20.00", { transaction_status: status })], total_pages: 1 }),
    );
    await syncTransactions(db, pp.client, SELLER, NOW);
    status = "S";
    const later = new Date(NOW.getTime() + 15 * 60_000);
    await syncTransactions(db, pp.client, SELLER, later);

    const second = pp.apiCalls().at(-1)!;
    expect(query(second).start_date).toBe(new Date(NOW.getTime() - 3 * HOUR).toISOString().replace(".000Z", "Z"));
    const rows = await db.select().from(transactions);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("S");
  });

  it("records an error with PayPal's debug ID and leaves the cursor alone", async () => {
    const ok = fakePayPal(() => json(200, { transaction_details: [], total_pages: 1 }));
    await syncTransactions(db, ok.client, SELLER, NOW);
    const failing = fakePayPal(() => json(400, { name: "INVALID_REQUEST" }, "dbg-ts-400"));
    const report = await syncTransactions(db, failing.client, SELLER, new Date(NOW.getTime() + HOUR));

    expect(report).toMatchObject({ ok: false, error: "Transaction Search HTTP 400", debugId: "dbg-ts-400" });
    const [state] = await db.select().from(syncState);
    expect(state).toMatchObject({ job: "transactions", syncedThrough: NOW, lastError: "Transaction Search HTTP 400", lastDebugId: "dbg-ts-400" });
  });

  it("treats a timeout as a failed run to retry, not as data", async () => {
    const pp = fakePayPal(() => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const report = await syncTransactions(db, pp.client, SELLER, NOW);
    expect(report.ok).toBe(false);
    const [state] = await db.select().from(syncState);
    expect(state.syncedThrough).toBeNull();
  });
});

describe("syncDisputes", () => {
  const dispute = (id: string, status = "OPEN") => ({
    dispute_id: id,
    create_time: "2026-10-20T10:00:00.000Z",
    update_time: "2026-10-21T10:00:00.000Z",
    status,
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    dispute_life_cycle_stage: "INQUIRY",
    dispute_amount: { currency_code: "USD", value: "24.00" },
    disputed_transactions: [{ seller_transaction_id: "1GB72668J97404239" }],
  });

  it("backfills 90 days by update time, follows next links, and stores disputes", async () => {
    const pp = fakePayPal((call) =>
      call.path.includes("next_page_token")
        ? json(200, { items: [dispute("PP-D-2")], links: [] })
        : json(200, {
            items: [dispute("PP-D-1")],
            links: [{ rel: "next", href: "https://api-m.sandbox.paypal.com/v1/customer/disputes?next_page_token=abc" }],
          }),
    );
    const report = await syncDisputes(db, pp.client, SELLER, NOW);

    expect(query(pp.apiCalls()[0]).update_time_after).toBe(new Date(NOW.getTime() - 90 * DAY).toISOString());
    expect(pp.apiCalls()[1].path).toBe("/v1/customer/disputes?next_page_token=abc");
    expect(report).toMatchObject({ ok: true, upserted: 2, requests: 2, syncedThrough: NOW });
    const rows = await db.select().from(disputes);
    expect(rows.map((r) => r.disputeId).sort()).toEqual(["PP-D-1", "PP-D-2"]);
    expect(rows[0]).toMatchObject({ amount: "24.00", stage: "INQUIRY", sellerTransactionIds: ["1GB72668J97404239"] });
  });

  it("picks up status changes on the next run", async () => {
    let status = "OPEN";
    const pp = fakePayPal(() => json(200, { items: [dispute("PP-D-1", status)] }));
    await syncDisputes(db, pp.client, SELLER, NOW);
    status = "RESOLVED";
    await syncDisputes(db, pp.client, SELLER, new Date(NOW.getTime() + HOUR));
    expect(query(pp.apiCalls()[1]).update_time_after).toBe(new Date(NOW.getTime() - HOUR).toISOString()); // cursor − 1 h overlap
    const [row] = await db.select().from(disputes);
    expect(row.status).toBe("RESOLVED");
  });

  it("records an error and leaves the cursor alone", async () => {
    const pp = fakePayPal(() => json(503, {}, "dbg-d-503"));
    const report = await syncDisputes(db, pp.client, SELLER, NOW);
    expect(report).toMatchObject({ ok: false, debugId: "dbg-d-503" });
    const [state] = await db.select().from(syncState);
    expect(state).toMatchObject({ job: "disputes", syncedThrough: null, lastDebugId: "dbg-d-503" });
  });
});
