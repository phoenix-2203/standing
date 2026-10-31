import { describe, expect, it } from "vitest";
import { computeMetrics, type Sale } from "@/lib/metrics/compute";
import { AS_OF, daysAgo, sale, steady } from "@/test/seed";
import { evaluate } from "./rules";

const kinds = (sales: Sale[], disputes: Date[] = []) =>
  evaluate(computeMetrics({ asOf: AS_OF, sales, disputeCreatedAt: disputes })).map((c) => c.kind);

// A quiet, healthy seller: 2 × $20 a day for 60 days, all tracked, one category.
const quiet = () => steady(60, 1, 2, 20);

describe("alert rules on seeded data", () => {
  it("a quiet, healthy seller raises nothing", () => {
    expect(kinds(quiet())).toEqual([]);
  });

  it("fires the spike alert at 3× and not below", () => {
    expect(kinds([...quiet(), ...steady(0, 0, 6, 20)])).toContain("spike"); // $120 vs $40/day = 3.0×
    expect(kinds([...quiet(), ...steady(0, 0, 5, 20), sale(2, 19.99)])).not.toContain("spike"); // 2.99975×
  });

  it("spike message states the numbers and PayPal's published reason, and never rounds up", () => {
    const [c] = evaluate(
      computeMetrics({ asOf: AS_OF, sales: [...quiet(), ...steady(0, 0, 6, 20), sale(2, 19.99)], disputeCreatedAt: [] }),
    ).filter((c) => c.kind === "spike");
    expect(c.message).toBe(
      "Sales in the last 24 hours ($139.99) are 3.4× your average day over the previous 28 days ($40.00). " +
        "PayPal lists a spike in sales among the reasons it may hold funds.",
    );
    expect(c.message).not.toMatch(/will|going to|limit your account/i);
    expect(c.facts).toMatchObject({ last24hCents: 13999, baselineDailyMeanCents: 4000, threshold: 3 });
  });

  it("fires on average ticket ≥ 2× and on a single order ≥ 5× the 28-day average", () => {
    const pricier = [...steady(60, 7, 1, 20), ...steady(6, 0, 1, 80)];
    expect(kinds(pricier)).toContain("avg_ticket");
    const oneBig = [...quiet(), sale(5, 2000)];
    expect(kinds(oneBig)).toContain("large_order");
    expect(kinds([...quiet(), sale(5, 100)])).not.toContain("large_order");
  });

  it("fires on a new product type", () => {
    expect(kinds([...quiet(), sale(3, 20, { categories: ["e-cigarettes"] })])).toContain("new_product_type");
  });

  it("fires below 90% tracking coverage, not at 90%", () => {
    const due = (n: number, tracked: number) => Array.from({ length: n }, (_, i) => sale(72 + i, 20, { hasTracking: i < tracked }));
    expect(kinds(due(10, 8))).toContain("tracking_coverage");
    expect(kinds(due(10, 9))).not.toContain("tracking_coverage");
  });

  it("fires on any digital order > 24 h old not marked Completed", () => {
    expect(kinds([...quiet(), sale(30, 9, { kind: "digital" })])).toContain("digital_gap");
    expect(kinds([...quiet(), sale(30, 9, { kind: "digital", completed: true })])).not.toContain("digital_gap");
  });

  it("never alerts on the dispute rate (PayPal publishes no threshold)", () => {
    const disputes = Array.from({ length: 50 }, (_, i) => daysAgo(i + 1));
    expect(kinds(quiet(), disputes)).toEqual([]);
  });

  it("raises nothing for a brand-new seller with no history", () => {
    // No baseline → spike ratio is null; but first-day sales still form a "new" category.
    expect(kinds([sale(2, 500)])).toEqual(["new_product_type"]);
  });
});
