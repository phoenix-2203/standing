import { describe, expect, it } from "vitest";
import { computeMetrics, type Sale } from "@/lib/metrics/compute";
import { AS_OF, daysAgo, sale, steady } from "@/test/seed";
import { evaluate } from "./rules";

// An established seller (first sale 120 days ago) unless a test says otherwise.
const kinds = (sales: Sale[], disputes: Date[] = [], firstSaleAt: Date | null = daysAgo(120)) =>
  evaluate(computeMetrics({ asOf: AS_OF, sales, disputeCreatedAt: disputes, firstSaleAt })).map((c) => c.kind);

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
      computeMetrics({ asOf: AS_OF, sales: [...quiet(), ...steady(0, 0, 6, 20), sale(2, 19.99)], disputeCreatedAt: [], firstSaleAt: daysAgo(120) }),
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

  it("shows a calm 'New seller' status for a seller with under 7 days of history, and nothing noisy", () => {
    // First sale 2 days ago: no spike ratio yet, new product type suppressed, a big first order isn't "large".
    expect(kinds([sale(48, 20), sale(2, 500)], [], daysAgo(2))).toEqual(["new_seller"]);
    expect(kinds([], [], null)).toEqual(["new_seller"]); // no sales yet
    expect(kinds(quiet(), [], daysAgo(7))).not.toContain("new_seller");
  });

  it("names the real baseline length when there are fewer than 28 days of history", () => {
    const [c] = evaluate(
      computeMetrics({ asOf: AS_OF, sales: [...steady(10, 1, 2, 20), ...steady(0, 0, 6, 20)], disputeCreatedAt: [], firstSaleAt: daysAgo(11) }),
    ).filter((c) => c.kind === "spike");
    expect(c.message).toContain("are 3.0× your average day over the previous 10 days ($40.00)");
  });

  it("'New seller' is an info note with a checklist link, citing PayPal's published reason without predicting", () => {
    const [c] = evaluate(computeMetrics({ asOf: AS_OF, sales: [sale(48, 20)], disputeCreatedAt: [], firstSaleAt: daysAgo(2) }));
    expect(c).toMatchObject({ kind: "new_seller", severity: "info", link: "/checklist" });
    expect(c.message).toContain("first-time seller");
    expect(c.message).not.toMatch(/will|going to/i);
  });
});
