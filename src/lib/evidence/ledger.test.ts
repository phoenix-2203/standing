import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { evidenceItems, products, shipments, transactionItems, transactions } from "@/db/schema";
import { upsertTransaction } from "@/lib/sync/transactions";
import { testDb } from "@/test/helpers";
import { addInvoice, addTrafficSource, InvalidEvidence, removeSellerEvidence, sellerEvidence, syncLedger } from "./ledger";

const SELLER = "seller-1";
const sale = (id: string, value = "18.00", items?: object[], code = "T0006") =>
  upsertTransaction(db, SELLER, {
    transaction_info: {
      transaction_id: id,
      transaction_event_code: code,
      transaction_status: "S",
      transaction_initiation_date: "2026-10-31T13:20:00Z",
      transaction_amount: { currency_code: "USD", value },
    },
    cart_info: { item_details: (items ?? []) as never },
  });

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  for (const t of [evidenceItems, shipments, transactionItems, transactions, products]) await db.delete(t);
});

describe("syncLedger", () => {
  it("adds a payment item per sale, a tracking item per live tracker, and a Completed item for digital", async () => {
    await sale("1GB72668J97404239");
    await sale("5VE587515T743130S", "12.00");
    await sale("REFUND1", "-18.00", [], "T1107"); // not a sale: no evidence
    await db.insert(shipments).values([
      { sellerId: SELLER, transactionId: "1GB72668J97404239", trackerId: "1GB72668J97404239-STANDINGD1PHY01", trackingNumber: "STANDINGD1PHY01", carrier: "USPS", status: "SHIPPED", source: "paypal_read" },
      { sellerId: SELLER, transactionId: "5VE587515T743130S", trackerId: "5VE587515T743130S-NOTRACKER", status: "COMPLETED", source: "standing_push" },
    ]);
    expect(await syncLedger(db, SELLER)).toEqual({ upserted: 4, removed: 0 });

    const byId = Object.fromEntries((await db.select().from(evidenceItems)).map((e) => [e.id, e]));
    expect(Object.keys(byId).sort()).toEqual([
      "EV-DIG-5VE587515T743130S",
      "EV-TRK-1GB72668J97404239-STANDINGD1PHY01",
      "EV-TXN-1GB72668J97404239",
      "EV-TXN-5VE587515T743130S",
    ]);
    expect(byId["EV-TXN-1GB72668J97404239"]).toMatchObject({ kind: "txn", source: "paypal", summary: "PayPal payment 1GB72668J97404239 of USD 18.00 received on 2026-10-31." });
    expect(byId["EV-TRK-1GB72668J97404239-STANDINGD1PHY01"].summary).toBe("Tracking number STANDINGD1PHY01 (USPS) is on PayPal payment 1GB72668J97404239, status SHIPPED.");
    expect(byId["EV-DIG-5VE587515T743130S"]).toMatchObject({ kind: "digital_delivery", summary: "PayPal payment 5VE587515T743130S is marked Completed in PayPal (digital delivery)." });
  });

  it("is idempotent, and drops tracking evidence when the tracker is cancelled", async () => {
    await sale("1GB72668J97404239");
    await db.insert(shipments).values({ sellerId: SELLER, transactionId: "1GB72668J97404239", trackerId: "T1", trackingNumber: "STANDINGD1PHY01", carrier: "USPS", status: "SHIPPED", source: "paypal_read" });
    await syncLedger(db, SELLER);
    await syncLedger(db, SELLER);
    expect(await db.select().from(evidenceItems)).toHaveLength(2);

    await db.update(shipments).set({ status: "CANCELLED" });
    expect(await syncLedger(db, SELLER)).toEqual({ upserted: 1, removed: 1 });
    expect((await db.select().from(evidenceItems)).map((e) => e.id)).toEqual(["EV-TXN-1GB72668J97404239"]);
  });

  it("never removes what the seller added", async () => {
    await addTrafficSource(db, SELLER, { label: "TikTok video", url: "https://www.tiktok.com/@maker/video/1", date: "2026-10-30" });
    await syncLedger(db, SELLER);
    expect(await db.select().from(evidenceItems)).toHaveLength(1);
  });
});

describe("addInvoice", () => {
  it("says 'matches a product' when one line matches", async () => {
    await sale("TX9", "18.00", [{ item_name: "Cedar candle" }]);
    const e = await addInvoice(db, SELLER, { supplier: "Wick Co", invoiceNumber: "INV-1", date: "2026-10-20", lines: [{ description: "Cedar candle", quantity: 5 }, { description: "Jars", quantity: 5 }], simulated: true });
    expect(e.summary).toContain("lists 2 lines; 1 matches a product sold (Cedar candle) in 1 order.");
  });

  it("matches invoice lines to products sold, by catalogue name/SKU or the item name on the sale", async () => {
    await db.insert(products).values({ sellerId: SELLER, sku: "CANDLE-LAV", name: "Lavender candle", category: "candles", kind: "physical" });
    await sale("TX1", "18.00", [{ item_name: "Lavender candle", item_code: "CANDLE-LAV" }]);
    await sale("TX2", "18.00", [{ item_code: "CANDLE-LAV" }]);
    await sale("TX3", "9.00", [{ item_name: "Wick trimmer" }]);
    const e = await addInvoice(db, SELLER, {
      supplier: "Lagos Wax Co.",
      invoiceNumber: "INV-0042",
      date: "2026-10-20",
      lines: [
        { description: "Lavender Candle", quantity: 100 },
        { description: "wick trimmer", quantity: 10 },
        { description: "Glass jars", quantity: 100 },
      ],
      simulated: true,
    });
    expect(e).toMatchObject({ id: "EV-INV-LAGOS-WAX-CO-INV-0042", kind: "invoice", source: "seller", simulated: true });
    expect(e.summary).toBe(
      "Simulated: Supplier invoice INV-0042 from Lagos Wax Co. dated 2026-10-20 lists 3 lines; 2 match products sold (Lavender Candle, wick trimmer) in 3 orders.",
    );
    expect(e.facts).toMatchObject({ matchedProducts: ["Lavender Candle", "wick trimmer"], matchedOrders: 3 });
  });

  it.each([
    [{ supplier: "" }, /supplier/],
    [{ date: "20/10/2026" }, /YYYY-MM-DD/],
    [{ lines: [] }, /lines/],
    [{ lines: [{ description: "x", quantity: 1.5 }] }, /lines/],
    [{ date: "2026-02-30" }, /YYYY-MM-DD/],
    [{ date: "2099-01-01" }, /future/],
    [{ lines: Array.from({ length: 51 }, () => ({ description: "x", quantity: 1 })) }, /lines/],
    [{ supplier: 7 }, /supplier/],
    [{ simulated: "yes" }, /simulated/],
  ])("rejects %j", async (bad, msg) => {
    await expect(addInvoice(db, SELLER, { supplier: "S", invoiceNumber: "1", date: "2026-10-20", lines: [{ description: "x", quantity: 1 }], ...(bad as object) })).rejects.toThrow(msg);
  });
});

describe("addTrafficSource", () => {
  it("stores the seller's source with a stable ID", async () => {
    const a = await addTrafficSource(db, SELLER, { label: "TikTok video: pouring the lavender candle", url: "https://www.tiktok.com/@maker/video/1", date: "2026-10-30", simulated: true });
    const b = await addTrafficSource(db, SELLER, { label: "TikTok video (edited label)", url: "https://www.tiktok.com/@maker/video/1", date: "2026-10-30", simulated: true });
    expect(a.id).toMatch(/^EV-SRC-[0-9A-F]{10}$/);
    expect(b.id).toBe(a.id);
    expect(b.summary).toBe("Simulated: Traffic source added by the seller: TikTok video (edited label) (https://www.tiktok.com/@maker/video/1), from 2026-10-30.");
  });

  it.each([
    [{ url: "javascript:alert(1)" }, /https/],
    [{ url: "http://example.com" }, /https/],
    [{ url: "not a url" }, /valid URL/],
    [{ label: "" }, /label/],
    [{ date: "2099-01-01" }, /future/],
    [{ url: `https://example.com/${"a".repeat(600)}` }, /too long/],
  ])("rejects %j", async (bad, msg) => {
    await expect(addTrafficSource(db, SELLER, { label: "x", url: "https://example.com", date: "2026-10-30", ...(bad as object) })).rejects.toThrow(msg);
  });

  it("input mistakes are InvalidEvidence, the only errors whose text the routes show the seller", async () => {
    await expect(addTrafficSource(db, SELLER, { label: "x", url: "nope", date: "2026-10-30" })).rejects.toBeInstanceOf(InvalidEvidence);
    await expect(addInvoice(db, SELLER, { supplier: "", invoiceNumber: "1", date: "2026-10-20", lines: [] })).rejects.toBeInstanceOf(InvalidEvidence);
  });
});

describe("seller-added evidence list and removal", () => {
  it("lists only what this seller added, newest first, and removes only those items", async () => {
    await db.insert(evidenceItems).values({ sellerId: SELLER, id: "EV-TXN-1", kind: "txn", occurredAt: new Date("2026-10-31T00:00:00Z"), summary: "Payment", facts: {}, source: "paypal" });
    const older = await addTrafficSource(db, SELLER, { label: "Newsletter", url: "https://example.com/news", date: "2026-10-01", simulated: true });
    const newer = await addTrafficSource(db, SELLER, { label: "Video", url: "https://example.com/video", date: "2026-10-30", simulated: true });
    await addTrafficSource(db, "someone-else", { label: "Theirs", url: "https://example.com/theirs", date: "2026-10-30" });

    expect((await sellerEvidence(db, SELLER)).map((e) => e.id)).toEqual([newer.id, older.id]);
    expect(await removeSellerEvidence(db, SELLER, older.id)).toBe(true);
    expect(await removeSellerEvidence(db, SELLER, older.id)).toBe(false);
    expect(await removeSellerEvidence(db, SELLER, "EV-TXN-1")).toBe(false);
    expect(await removeSellerEvidence(db, SELLER, (await sellerEvidence(db, "someone-else"))[0].id)).toBe(false);
    expect((await sellerEvidence(db, SELLER)).map((e) => e.id)).toEqual([newer.id]);
  });
});
