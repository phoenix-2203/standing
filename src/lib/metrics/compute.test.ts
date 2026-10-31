import { describe, expect, it } from "vitest";
import { AS_OF, daysAgo, sale, steady } from "@/test/seed";
import { computeMetrics, toCents } from "./compute";

const run = (sales: ReturnType<typeof steady>, disputeCreatedAt: Date[] = []) => computeMetrics({ asOf: AS_OF, sales, disputeCreatedAt });

describe("spike ratio", () => {
  it("= last-24h gross ÷ mean daily gross of the previous 28 days", () => {
    // Baseline: 2 × $20 a day for 28 days = $40/day. Last 24 h: 6 × $20 = $120 → 3×.
    const m = run([...steady(28, 1, 2, 20), ...steady(0, 0, 6, 20)]);
    expect(m.spike).toEqual({ last24hCents: 12000, baselineDailyMeanCents: 4000, ratio: 3 });
  });

  it("excludes the last 24 h from the baseline and ignores sales older than 29 days", () => {
    const m = run([...steady(28, 1, 1, 10), sale(29 * 24 + 1, 1000), sale(1, 10)]);
    expect(m.spike.baselineDailyMeanCents).toBe(1000);
    expect(m.spike.ratio).toBe(1);
  });

  it("is null with no baseline (a brand-new seller is not a 'spike')", () => {
    expect(run([sale(1, 500)]).spike.ratio).toBeNull();
  });

  it("puts a sale exactly 24 h old in the baseline, not the last 24 h", () => {
    const m = run([sale(24, 50)]);
    expect(m.spike.last24hCents).toBe(0);
    expect(m.spike.baselineDailyMeanCents).toBeCloseTo(5000 / 28);
  });
});

describe("average ticket change", () => {
  it("= 7-day avg order ÷ 28-day avg (the 28 days include the last 7)", () => {
    // Days 28–8: $20 orders; days 7–1: $60 orders, one a day each.
    const m = run([...steady(27, 7, 1, 20), ...steady(6, 0, 1, 60)]);
    expect(m.avgTicket.avg7dCents).toBe(6000);
    expect(m.avgTicket.avg28dCents).toBe((21 * 2000 + 7 * 6000) / 28);
    expect(m.avgTicket.ratio).toBeCloseTo(2);
  });

  it("reports the largest order of the last 7 days as a multiple of the 28-day avg", () => {
    const sales = [...steady(27, 0, 1, 20)];
    const big = sale(3, 300);
    const m = run([...sales, big]);
    expect(m.avgTicket.largestRecent).toEqual({ id: big.id, cents: 30000, multiple: 30000 / ((28 * 2000 + 30000) / 29) });
  });

  it("is null without orders", () => {
    expect(run([]).avgTicket).toMatchObject({ avg7dCents: null, avg28dCents: null, ratio: null, largestRecent: null });
  });
});

describe("new product type", () => {
  it("= categories sold in the last 7 days that weren't sold in the 60 days before", () => {
    const m = run([
      ...steady(60, 8, 1, 20, { categories: ["candles"] }),
      sale(70 * 24, 20, { categories: ["soap"] }), // 70 days ago: outside the prior-60 window
      sale(2 * 24, 20, { categories: ["candles"] }),
      sale(1 * 24, 20, { categories: ["e-cigarettes"] }),
      sale(10, 20, { categories: ["soap"] }),
      sale(5, 20, { categories: [] }),
    ]);
    expect(m.newProductTypes).toEqual({
      newCategories: ["e-cigarettes", "soap"],
      recentCategories: ["candles", "e-cigarettes", "soap"],
      uncategorizedRecentOrders: 1,
    });
  });

  it("treats a category last sold 66 days ago as already known", () => {
    const m = run([sale(66 * 24, 20, { categories: ["soap"] }), sale(1, 20, { categories: ["soap"] })]);
    expect(m.newProductTypes.newCategories).toEqual([]);
  });
});

describe("tracking coverage", () => {
  it("= physical orders > 48 h old with tracking ÷ all such orders", () => {
    const m = run([
      ...steady(10, 3, 1, 20, { hasTracking: true }), // 8 tracked
      sale(50, 20, { hasTracking: false }),
      sale(60, 20, { hasTracking: false }),
      sale(47, 20, { hasTracking: false }), // < 48 h: not due yet
      sale(100, 20, { kind: "digital", hasTracking: false }), // not physical
      sale(100, 20, { kind: null, hasTracking: false }), // unclassified
    ]);
    expect(m.trackingCoverage).toMatchObject({ eligible: 10, withTracking: 8, coverage: 0.8, unclassifiedOrders: 1 });
    expect(m.trackingCoverage.missing).toHaveLength(2);
  });

  it("is null when no physical order is due", () => {
    expect(run([sale(10, 20)]).trackingCoverage.coverage).toBeNull();
  });

  it("only looks at the last 90 days of orders", () => {
    const m = run([sale(91 * 24, 20, { hasTracking: false }), sale(89 * 24, 20)]);
    expect(m.trackingCoverage).toMatchObject({ eligible: 1, coverage: 1 });
  });
});

describe("digital completion gap", () => {
  it("= digital or service orders > 24 h old not marked Completed", () => {
    const due = sale(30, 15, { kind: "digital", completed: false });
    const service = sale(40, 50, { kind: "service", completed: false });
    const m = run([
      due,
      service,
      sale(30, 15, { kind: "digital", completed: true }),
      sale(23, 15, { kind: "digital", completed: false }), // < 24 h
      sale(30, 15, { kind: "physical", completed: false }),
    ]);
    expect(m.digitalCompletionGap).toEqual({ count: 2, orders: [due.id, service.id] });
  });
});

describe("dispute rate (90 d)", () => {
  it("= disputes opened ÷ orders, both in the last 90 days", () => {
    const m = run(steady(89, 0, 2, 20), [daysAgo(10), daysAgo(80), daysAgo(91)]);
    expect(m.disputeRate90d).toEqual({ disputes: 2, orders: 180, rate: 2 / 180 });
  });

  it("is null with no orders", () => {
    expect(run([], [daysAgo(1)]).disputeRate90d.rate).toBeNull();
  });
});

describe("toCents", () => {
  it.each([
    ["18.10", 1810],
    ["18.1", 1810],
    ["500", 50000],
    ["-17.94", -1794],
    ["0.07", 7],
  ])("%s → %d", (v, c) => expect(toCents(v)).toBe(c));

  it("rejects non-amounts", () => {
    expect(() => toCents("1e3")).toThrow();
  });
});

it("ignores sales after asOf", () => {
  expect(run([sale(-1, 999)]).spike.last24hCents).toBe(0);
});
