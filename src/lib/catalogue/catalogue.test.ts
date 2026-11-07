import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { products, shopOrders, transactionItems, transactions } from "@/db/schema";
import { buildChecklist } from "@/lib/connect/checklist";
import { recordShopOrder } from "@/lib/shop/orders";
import { upsertTransaction } from "@/lib/sync/transactions";
import { testDb } from "@/test/helpers";
import { orderRows } from "@/lib/ui/data";
import { catalogueView, deleteProduct, InvalidProduct, saveProduct } from "./catalogue";

const SELLER = "seller-1";
const OTHER = "seller-2";
const NOW = new Date("2026-11-08T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

async function sale(id: string, items: { item_name?: string; item_code?: string }[] = [], seller = SELLER, at = daysAgo(3)) {
  await upsertTransaction(db, seller, {
    transaction_info: { transaction_id: id, transaction_event_code: "T0006", transaction_status: "S", transaction_initiation_date: at, transaction_amount: { currency_code: "USD", value: "20.00" } },
    cart_info: { item_details: items },
  });
}

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  for (const t of [shopOrders, transactionItems, transactions, products]) await db.delete(t);
});

describe("saveProduct", () => {
  it("stores a trimmed product", async () => {
    const p = await saveProduct(db, SELLER, { name: "  Soy candle ", sku: " C1 ", kind: "physical", category: " Candles " });
    expect(p).toMatchObject({ sellerId: SELLER, name: "Soy candle", sku: "C1", kind: "physical", category: "Candles" });
  });

  it.each([
    [{ name: "", kind: "physical" }, /name/],
    [{ name: "   ", kind: "physical" }, /name/],
    [{ name: "A" }, /physical, digital or service/],
    [{ name: "A", kind: "free" }, /physical, digital or service/],
    [{ name: 7, kind: "digital" }, /text/],
    [{ name: "x".repeat(201), kind: "digital" }, /at most/],
    [{ name: "A", kind: "digital", sku: {} }, /text/],
  ])("refuses %j", async (input, message) => {
    const err = await saveProduct(db, SELLER, input).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidProduct);
    expect(err.message).toMatch(message);
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("updates the same name, ignoring case, instead of adding a second", async () => {
    await saveProduct(db, SELLER, { name: "Soy candle", sku: "C1", kind: "physical" });
    const p = await saveProduct(db, SELLER, { name: "SOY CANDLE", kind: "digital" });
    expect(p).toMatchObject({ name: "Soy candle", sku: "C1", kind: "digital" });
    expect(await db.select().from(products)).toHaveLength(1);
  });

  it("refuses a SKU that belongs to another of the seller's products", async () => {
    await saveProduct(db, SELLER, { name: "One", sku: "S", kind: "physical" });
    await expect(saveProduct(db, SELLER, { name: "Two", sku: "S", kind: "physical" })).rejects.toThrow(/already belongs to "One"/);
  });

  it("keeps one spelling per category, so case can't fake a new product type", async () => {
    await saveProduct(db, SELLER, { name: "One", kind: "physical", category: "Candles" });
    const p = await saveProduct(db, SELLER, { name: "Two", kind: "physical", category: "candles" });
    expect(p.category).toBe("Candles");
  });

  it("keeps sellers apart: same name and SKU are fine, and one seller's category isn't reused", async () => {
    await saveProduct(db, SELLER, { name: "One", sku: "S", kind: "physical", category: "Candles" });
    const p = await saveProduct(db, OTHER, { name: "One", sku: "S", kind: "digital", category: "candles" });
    expect(p).toMatchObject({ sellerId: OTHER, kind: "digital", category: "candles" });
    expect(await db.select().from(products)).toHaveLength(2);
  });
});

describe("deleteProduct", () => {
  it("removes the seller's own product", async () => {
    const p = await saveProduct(db, SELLER, { name: "One", kind: "physical" });
    expect(await deleteProduct(db, SELLER, p.id)).toBe(true);
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("can't remove another seller's product, and treats a bad ID as not found", async () => {
    const p = await saveProduct(db, SELLER, { name: "One", kind: "physical" });
    expect(await deleteProduct(db, OTHER, p.id)).toBe(false);
    expect(await deleteProduct(db, SELLER, "not-a-uuid")).toBe(false);
    expect(await db.select().from(products)).toHaveLength(1);
  });
});

describe("catalogueView", () => {
  it("groups unmatched items by product, most orders first, and hides matched ones", async () => {
    await sale("A", [{ item_name: "Pattern PDF" }]);
    await sale("B", [{ item_name: " pattern pdf " }]);
    await sale("C", [{ item_name: "Mug", item_code: "M1" }]);
    await sale("D", [{ item_name: "Listed" }]);
    await saveProduct(db, SELLER, { name: "Listed", kind: "physical" });
    const v = await catalogueView(db, SELLER, NOW);
    expect(v.unmatched).toEqual([
      { name: "Pattern PDF", sku: null, orders: 2 },
      { name: "Mug", sku: "M1", orders: 1 },
    ]);
    expect(v.ordersWithoutProductDetails).toBe(0);
  });

  it("counts orders PayPal sent no product details for, except demo-shop orders", async () => {
    await sale("BARE1");
    await sale("BARE2", [{}]);
    await sale("SHOP");
    await recordShopOrder(db, SELLER, { id: "OSHOP", purchase_units: [{ items: [{ category: "PHYSICAL_GOODS" }], payments: { captures: [{ id: "SHOP" }] } }] });
    expect((await catalogueView(db, SELLER, NOW)).ordersWithoutProductDetails).toBe(2);
  });

  it("shows only this seller's orders from the last 90 days", async () => {
    await sale("MINE", [{ item_name: "Mine" }]);
    await sale("THEIRS", [{ item_name: "Theirs" }], OTHER);
    await sale("OLD", [{ item_name: "Old" }], SELLER, daysAgo(91));
    await saveProduct(db, OTHER, { name: "Their product", kind: "digital" });
    const v = await catalogueView(db, SELLER, NOW);
    expect(v.unmatched.map((u) => u.name)).toEqual(["Mine"]);
    expect(v.products).toEqual([]);
  });
});

describe("a saved product classifies the seller's orders", () => {
  it("moves an order from unclassified to its kind, and back when removed", async () => {
    await sale("A", [{ item_name: "Soy candle" }]);
    expect((await orderRows(db, SELLER, NOW))[0].kind).toBe("unclassified");
    const p = await saveProduct(db, SELLER, { name: "soy candle", kind: "physical" });
    expect((await orderRows(db, SELLER, NOW))[0].kind).toBe("physical");
    await deleteProduct(db, SELLER, p.id);
    expect((await orderRows(db, SELLER, NOW))[0].kind).toBe("unclassified");
  });

  it("the checklist points unclassified orders at the catalogue", async () => {
    await sale("A", [{ item_name: "Soy candle" }]);
    const items = await buildChecklist(db, SELLER, NOW);
    expect(items.find((i) => i.id === "tracking")?.action?.href).toBe("/catalogue");
    expect(items.find((i) => i.id === "digital")?.action?.href).toBe("/catalogue");
  });
});
