import { describe, expect, it } from "vitest";
import { demoOrderBody, demoOrders } from "./demo";

describe("demo orders", () => {
  it("makes count physical orders, two digital, one gift set, all with item names and SKUs", () => {
    const o = demoOrders("demo-1110", 12);
    expect(o).toHaveLength(15);
    expect(o.filter((x) => x.item.category === "DIGITAL_GOODS")).toHaveLength(2);
    expect(o.at(-1)).toMatchObject({ unitPrice: "180.00", item: { sku: "CND-GIFT12" } });
    for (const x of o) expect(x.item.name && x.item.sku).toBeTruthy();
  });

  it("request IDs are stable per tag and unique within a run, so a re-run never doubles the orders", () => {
    const a = demoOrders("demo-1110").map((x) => x.requestId);
    expect(demoOrders("demo-1110").map((x) => x.requestId)).toEqual(a);
    expect(new Set(a).size).toBe(a.length);
    expect(demoOrders("demo-1111")[0].requestId).not.toBe(a[0]);
  });

  it("rejects bad tags and counts", () => {
    expect(() => demoOrders("Demo Tag")).toThrow(/tag/);
    expect(() => demoOrders("demo", 0)).toThrow(/count/);
    expect(() => demoOrders("demo", 41)).toThrow(/count/);
  });

  it("the order body's item total matches the amount, with the item's name, SKU and category", () => {
    const body = demoOrderBody(demoOrders("demo-1110").at(-1)!);
    const unit = body.purchase_units[0];
    expect(unit.amount.value).toBe("180.00");
    expect(unit.amount.breakdown.item_total.value).toBe(unit.amount.value);
    expect(unit.items[0]).toMatchObject({ name: "Candle gift set", sku: "CND-GIFT12", category: "PHYSICAL_GOODS" });
  });
});
