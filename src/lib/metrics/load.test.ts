import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { disputes, metricsDaily, products, shipments, transactionItems, transactions } from "@/db/schema";
import { upsertTransaction } from "@/lib/sync/transactions";
import { testDb } from "@/test/helpers";
import { isSale, loadMetricsInput, runMetrics } from "./load";

const SELLER = "seller-1";
const AS_OF = new Date("2026-11-03T12:00:00Z");

const detail = (id: string, at: string, value: string, opts: { code?: string; status?: string; currency?: string; items?: object[] } = {}) => ({
  transaction_info: {
    transaction_id: id,
    transaction_event_code: opts.code ?? "T0006",
    transaction_status: opts.status ?? "S",
    transaction_initiation_date: at,
    transaction_amount: { currency_code: opts.currency ?? "USD", value },
  },
  cart_info: { item_details: (opts.items ?? []) as never },
});

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  for (const t of [shipments, transactionItems, transactions, products, disputes, metricsDaily]) await db.delete(t);
});

describe("isSale", () => {
  const base = { eventCode: "T0006", status: "S", amount: "20.00", currency: "USD" };
  it.each([
    [base, true],
    [{ ...base, eventCode: "T0000" }, true],
    [{ ...base, status: "P" }, true],
    [{ ...base, status: "V" }, false],
    [{ ...base, status: "D" }, false],
    [{ ...base, eventCode: "T1107", amount: "-20.00" }, false], // refund
    [{ ...base, amount: "-20.00" }, false],
    [{ ...base, currency: "EUR" }, false],
  ])("%j → %s", (t, expected) => expect(isSale(t, "USD")).toBe(expected));
});

describe("loadMetricsInput", () => {
  it("classifies orders through the seller's catalogue (SKU first, then name) and reads tracking/Completed", async () => {
    await db.insert(products).values([
      { sellerId: SELLER, sku: "CANDLE-LAV", name: "Lavender candle", category: "candles", kind: "physical" },
      { sellerId: SELLER, name: "Candle pattern PDF", category: "patterns", kind: "digital" },
    ]);
    await upsertTransaction(db, SELLER, detail("PHY", "2026-11-01T10:00:00Z", "18.00", { items: [{ item_code: "CANDLE-LAV", item_name: "renamed" }] }));
    await upsertTransaction(db, SELLER, detail("DIG", "2026-11-01T11:00:00Z", "9.00", { items: [{ item_name: "  candle pattern pdf " }] }));
    await upsertTransaction(db, SELLER, detail("MIX", "2026-11-01T12:00:00Z", "27.00", { items: [{ item_code: "CANDLE-LAV" }, { item_name: "Candle pattern PDF" }] }));
    await upsertTransaction(db, SELLER, detail("UNK", "2026-11-01T13:00:00Z", "5.00"));
    await upsertTransaction(db, SELLER, detail("REFUND", "2026-11-01T14:00:00Z", "-18.00", { code: "T1107" }));
    await upsertTransaction(db, "other-seller", detail("OTHER", "2026-11-01T15:00:00Z", "99.00"));
    await db.insert(shipments).values([
      { sellerId: SELLER, transactionId: "PHY", trackingNumber: "TRK1", carrier: "USPS", status: "SHIPPED", source: "standing_push" },
      { sellerId: SELLER, transactionId: "DIG", status: "COMPLETED", source: "standing_push" },
      { sellerId: SELLER, transactionId: "MIX", trackingNumber: "TRK2", carrier: "USPS", status: "CANCELLED", source: "paypal_read" },
    ]);

    const { sales } = await loadMetricsInput(db, SELLER, AS_OF);
    const byId = Object.fromEntries(sales.map((s) => [s.id, s]));
    expect(Object.keys(byId).sort()).toEqual(["DIG", "MIX", "PHY", "UNK"]);
    expect(byId.PHY).toMatchObject({ cents: 1800, kind: "physical", categories: ["candles"], hasTracking: true });
    expect(byId.DIG).toMatchObject({ kind: "digital", categories: ["patterns"], completed: true, hasTracking: false });
    expect(byId.MIX).toMatchObject({ kind: "physical", categories: ["candles", "patterns"], hasTracking: false }); // cancelled tracker
    expect(byId.UNK).toMatchObject({ kind: null, categories: [] });
  });

  it("loads only the last 90 days of orders and disputes", async () => {
    await upsertTransaction(db, SELLER, detail("OLD", "2026-08-01T00:00:00Z", "10.00"));
    await upsertTransaction(db, SELLER, detail("NEW", "2026-10-01T00:00:00Z", "10.00"));
    await upsertTransaction(db, SELLER, detail("FUTURE", "2026-11-04T00:00:00Z", "10.00"));
    await db.insert(disputes).values([
      { disputeId: "D-OLD", sellerId: SELLER, createdAtPaypal: new Date("2026-07-01T00:00:00Z"), status: "RESOLVED", sellerTransactionIds: [], raw: {} },
      { disputeId: "D-NEW", sellerId: SELLER, createdAtPaypal: new Date("2026-10-20T00:00:00Z"), status: "OPEN", sellerTransactionIds: [], raw: {} },
    ]);
    const input = await loadMetricsInput(db, SELLER, AS_OF);
    expect(input.sales.map((s) => s.id)).toEqual(["NEW"]);
    expect(input.disputeCreatedAt).toEqual([new Date("2026-10-20T00:00:00Z")]);
  });
});

describe("runMetrics", () => {
  it("stores one snapshot per seller per UTC day, overwriting earlier runs that day", async () => {
    await upsertTransaction(db, SELLER, detail("A", "2026-11-03T10:00:00Z", "20.00"));
    await runMetrics(db, SELLER, AS_OF);
    await upsertTransaction(db, SELLER, detail("B", "2026-11-03T12:30:00Z", "30.00"));
    const later = new Date("2026-11-03T13:00:00Z");
    const m = await runMetrics(db, SELLER, later);
    const rows = await db.select().from(metricsDaily);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ day: "2026-11-03", asOf: later, currency: "USD" });
    expect(rows[0].values.spike.last24hCents).toBe(5000);
    expect(m.spike.last24hCents).toBe(5000);
  });
});
