import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { packs, paypalConnections, shipments, shopOrders, transactionItems, transactions } from "@/db/schema";
import { recordShopOrder } from "@/lib/shop/orders";
import { upsertTransaction } from "@/lib/sync/transactions";
import { testDb } from "@/test/helpers";
import { buildChecklist } from "./checklist";

const SELLER = "seller-1";
const NOW = new Date("2026-11-08T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
async function order(id: string, category: string | null, h: number) {
  await upsertTransaction(db, SELLER, { transaction_info: { transaction_id: id, transaction_event_code: "T0006", transaction_status: "S", transaction_initiation_date: hoursAgo(h), transaction_amount: { currency_code: "USD", value: "20.00" } } });
  if (category) await recordShopOrder(db, SELLER, { id: `O${id}`, purchase_units: [{ items: [{ category }], payments: { captures: [{ id }] } }] });
}
const byId = async () => Object.fromEntries((await buildChecklist(db, SELLER, NOW)).map((i) => [i.id, i]));

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  for (const t of [packs, paypalConnections, shipments, shopOrders, transactionItems, transactions]) await db.delete(t);
});

describe("buildChecklist", () => {
  it("has four items in order, starting with the verified-seller check", async () => {
    expect((await buildChecklist(db, SELLER, NOW)).map((i) => i.id)).toEqual(["verified-seller", "tracking", "digital", "pack"]);
  });

  it("tracking: unknown while orders are unclassified, to do below 90%, done at 90% or more", async () => {
    await order("U1", null, 72);
    expect((await byId()).tracking).toMatchObject({ state: "unknown", detail: expect.stringContaining("1 orders") });
    await order("P1", "PHYSICAL_GOODS", 72);
    expect((await byId()).tracking).toMatchObject({ state: "todo", title: "Add tracking to physical orders", action: { href: "/orders" } });
    await db.insert(shipments).values({ sellerId: SELLER, transactionId: "P1", trackerId: "P1-T", trackingNumber: "T", carrier: "USPS", status: "SHIPPED", source: "paypal_read" });
    expect((await byId()).tracking).toMatchObject({ state: "done", detail: "1 of 1 physical orders older than 48 hours have tracking in PayPal." });
  });

  it("digital: to do while an order waits, done when none do", async () => {
    await order("D1", "DIGITAL_GOODS", 30);
    expect((await byId()).digital).toMatchObject({ state: "todo", detail: expect.stringContaining("1 digital or service order is") });
    await db.insert(shipments).values({ sellerId: SELLER, transactionId: "D1", trackerId: "D1-N", status: "COMPLETED", source: "standing_push" });
    expect((await byId()).digital.state).toBe("done");
    expect((await byId()).tracking.state).toBe("unknown"); // nothing physical is due yet
  });

  it("digital: unknown, not done, while orders are unclassified", async () => {
    await order("U1", null, 72);
    expect((await byId()).digital).toMatchObject({ state: "unknown", detail: expect.stringContaining("1 unclassified orders") });
  });

  it("pack: to do with no pack or a blocked one, done when the latest is ready", async () => {
    expect((await byId()).pack).toMatchObject({ state: "todo", title: "Build your explanation pack" });
    const base = { sellerId: SELLER, periodFrom: NOW, periodTo: NOW, salesCurve: [], summaryEvidenceId: "EV-SUM-X", evidence: [] };
    await db.insert(packs).values({ ...base, status: "blocked", createdAt: new Date(NOW.getTime() - 1000) });
    expect((await byId()).pack.detail).toContain("blocked");
    await db.insert(packs).values({ ...base, status: "ready", createdAt: NOW });
    expect((await byId()).pack.state).toBe("done");
  });

  it("never mentions funds being released", async () => {
    await order("D1", "DIGITAL_GOODS", 30);
    for (const i of await buildChecklist(db, SELLER, NOW)) expect(`${i.title} ${i.detail}`).not.toMatch(/releas|funds|unlock/i);
  });
});
