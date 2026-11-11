import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { actions, alerts, evidenceItems, packs, shipments, shopOrders, transactionItems, transactions } from "@/db/schema";
import { applyAlerts } from "@/lib/alerts/engine";
import { syncLedger } from "@/lib/evidence/ledger";
import { runMetrics } from "@/lib/metrics/load";
import { recordShopOrder } from "@/lib/shop/orders";
import { upsertTransaction } from "@/lib/sync/transactions";
import { testDb } from "@/test/helpers";
import { dashboardData, orderRows, packDetail, packList, protectionLabel } from "./data";

const SELLER = "seller-1";
const NOW = new Date("2026-11-08T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
async function order(id: string, category: string, at: string, value = "20.00", seller = SELLER) {
  await upsertTransaction(db, seller, { transaction_info: { transaction_id: id, transaction_event_code: "T0006", transaction_status: "S", transaction_initiation_date: at, transaction_amount: { currency_code: "USD", value } } });
  await recordShopOrder(db, seller, { id: `O${id}`, purchase_units: [{ items: [{ category }], payments: { captures: [{ id }] } }] });
}

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  for (const t of [actions, alerts, packs, evidenceItems, shipments, shopOrders, transactionItems, transactions]) await db.delete(t);
});

describe("orderRows", () => {
  it("lists this seller's sales, newest first, with tracking, Completed, missing and evidence", async () => {
    await order("TRACKED", "PHYSICAL_GOODS", hoursAgo(72));
    await order("MISSING", "PHYSICAL_GOODS", hoursAgo(60), "18.50");
    await order("NEW", "PHYSICAL_GOODS", hoursAgo(5));
    await order("DIGI", "DIGITAL_GOODS", hoursAgo(30));
    await order("THEIRS", "PHYSICAL_GOODS", hoursAgo(30), "1.00", "seller-2");
    await db.insert(shipments).values([
      { sellerId: SELLER, transactionId: "TRACKED", trackerId: "T-1", trackingNumber: "9400111", carrier: "USPS", status: "SHIPPED", source: "paypal_read" },
      { sellerId: SELLER, transactionId: "DIGI", trackerId: "D-1", status: "COMPLETED", source: "standing_push" },
    ]);
    await syncLedger(db, SELLER, "USD", NOW);
    const rows = await orderRows(db, SELLER, NOW);
    expect(rows.map((r) => [r.transactionId, r.kind, r.tracking])).toEqual([
      ["NEW", "physical", "—"],
      ["DIGI", "digital", "Completed"],
      ["MISSING", "physical", "missing"],
      ["TRACKED", "physical", "USPS 9400111 (SHIPPED)"],
    ]);
    expect(rows.find((r) => r.transactionId === "MISSING")).toMatchObject({ amount: 18.5, amountText: "USD 18.50" });
    expect(rows.find((r) => r.transactionId === "TRACKED")!.evidence).toBe(2); // payment + tracking
    expect(rows.map((r) => r.trackingState)).toEqual(["none", "completed", "missing", "tracked"]);
  });

  it("labels a demo workspace's send Simulated, never Sent, from its stored SIMULATED debug ID", async () => {
    await order("REAL", "PHYSICAL_GOODS", hoursAgo(72));
    await order("DEMO", "PHYSICAL_GOODS", hoursAgo(72));
    const sent = (id: string, debug: string) => ({ sellerId: SELLER, type: "tracking_push", method: "POST", path: "/v1/shipping/trackers-batch", requestId: `track-${id}-9400111`, status: "sent" as const, paypalHttpStatus: 201, paypalDebugId: debug });
    await db.insert(actions).values([sent("REAL", "f0123456789ab"), sent("DEMO", "SIMULATED-DEMO")]);
    const rows = Object.fromEntries((await orderRows(db, SELLER, NOW)).map((r) => [r.transactionId, r.fix]));
    expect(rows).toEqual({ REAL: "sent", DEMO: "simulated" });
  });

  it("shows PayPal's own Seller Protection flag and item names exactly as PayPal sent them", async () => {
    const tx = (id: string, protection: string | undefined, items: string[]) =>
      upsertTransaction(db, SELLER, {
        transaction_info: { transaction_id: id, transaction_event_code: "T0006", transaction_status: "S", transaction_initiation_date: hoursAgo(10), transaction_amount: { currency_code: "USD", value: "5.00" }, ...(protection ? { protection_eligibility: protection } : {}) },
        cart_info: { item_details: items.map((name) => ({ item_name: name, item_quantity: "1" })) },
      });
    await tx("E", "01", ["Lavender soy candle", "Gift wrap"]);
    await tx("N", "02", []);
    await tx("P", "03", ["Candle gift set"]);
    await tx("X", undefined, []);
    await syncLedger(db, SELLER, "USD", NOW);
    const rows = Object.fromEntries((await orderRows(db, SELLER, NOW)).map((r) => [r.transactionId, [r.protection, r.items]]));
    expect(rows).toEqual({ E: ["eligible", "Lavender soy candle, Gift wrap"], N: ["not eligible", ""], P: ["partial", "Candle gift set"], X: ["not stated", ""] });
  });
});

describe("protectionLabel", () => {
  it("maps PayPal's codes and never guesses an unknown one", () => {
    expect(["01", "02", "03", "04", null, 1].map(protectionLabel)).toEqual(["eligible", "not eligible", "partial", "not stated", "not stated", "not stated"]);
  });
});

describe("dashboardData", () => {
  it("brings the verification item, warnings before notes, metrics and digital gaps together", async () => {
    await order("DIGI", "DIGITAL_GOODS", hoursAgo(30));
    await applyAlerts(db, SELLER, await runMetrics(db, SELLER, NOW), NOW);
    const d = await dashboardData(db, SELLER, NOW);
    expect(d.verification.title).toBe("Connect your PayPal account");
    expect(d.alerts.map((a) => [a.kind, a.severity])).toEqual([
      ["digital_gap", "warning"],
      ["new_seller", "info"],
    ]);
    expect(d.digital.map((g) => g.transactionId)).toEqual(["DIGI"]);
    expect(d.metrics.spike.status).toBe("not_enough_history");
    expect(d.latestPack).toBeNull();
  });
});

describe("packs", () => {
  it("lists and shows only this seller's packs", async () => {
    const [p] = await db
      .insert(packs)
      .values({ sellerId: SELLER, periodFrom: NOW, periodTo: NOW, status: "ready", salesCurve: [], summaryEvidenceId: "EV-SUM-X", evidence: [], letter: { paragraphs: [] } })
      .returning();
    await db.insert(packs).values({ sellerId: "seller-2", periodFrom: NOW, periodTo: NOW, status: "ready", salesCurve: [], summaryEvidenceId: "EV-SUM-Y", evidence: [] });
    expect((await packList(db, SELLER)).map((x) => x.id)).toEqual([p.id]);
    expect(await packDetail(db, SELLER, p.id)).toMatchObject({ id: p.id, status: "ready" });
    expect(await packDetail(db, "seller-2", p.id)).toBeNull();
    expect(await packDetail(db, SELLER, "not-a-uuid")).toBeNull();
  });
});
