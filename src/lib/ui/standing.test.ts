import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/alerts/rules";
import { computeMetrics } from "@/lib/metrics/compute";
import { AS_OF, daysAgo, steady } from "@/test/seed";
import { standingRows } from "./standing";

// Metrics → the alerts the engine would open → the table. The table must agree with the alerts.
function rowsFor(sales: ReturnType<typeof steady>, firstSaleDaysAgo: number, disputes: Date[] = []) {
  const m = computeMetrics({ asOf: AS_OF, sales, disputeCreatedAt: disputes, firstSaleAt: daysAgo(firstSaleDaysAgo) });
  const open = evaluate(m).map((c) => ({ kind: c.kind, severity: c.severity }));
  return Object.fromEntries(standingRows(m, open).map((r) => [r.key, r]));
}

describe("standingRows", () => {
  it("a calm, established seller: every reason clear, complaints shown for context only", () => {
    const r = rowsFor(steady(28, 1, 2, 20), 120);
    expect(Object.values(r).map((x) => [x.key, x.state])).toEqual([
      ["spike", "clear"],
      ["price", "clear"],
      ["item_type", "clear"],
      ["first_time", "clear"],
      ["tracking", "clear"],
      ["digital", "clear"],
      ["complaints", "context"],
    ]);
    expect(r.spike.threshold).toBe("Warns at 3× an average day");
  });

  it("a spike: the spike row needs you, with the figure rounded down, matching the open alert", () => {
    const r = rowsFor([...steady(28, 1, 2, 20), ...steady(0, 0, 12, 20)], 120); // 6×
    expect(r.spike).toMatchObject({ state: "needs_you", figure: "6.0× an average day (last 24 h USD 240.00)" });
    expect(r.price.state).toBe("clear");
  });

  it("a brand-new seller: first-time applies, history-based checks say so instead of 'clear'", () => {
    const r = rowsFor(steady(3, 0, 1, 20), 3);
    expect(r.first_time).toMatchObject({ state: "applies", figure: "First sale 3 days ago" });
    expect(r.spike.state).toBe("no_history");
    expect(r.item_type.state).toBe("no_history");
  });

  it("missing tracking and one very large order both need you", () => {
    const r = rowsFor([...steady(28, 3, 2, 20, { hasTracking: false }), ...steady(1, 1, 1, 200)], 120);
    expect(r.tracking.state).toBe("needs_you");
    expect(r.price).toMatchObject({ state: "needs_you", figure: "One order is 8.5× your average order" });
  });

  it("an alert still open from an earlier check keeps the row at 'needs you' and says why", () => {
    const m = computeMetrics({ asOf: AS_OF, sales: steady(28, 1, 2, 20), disputeCreatedAt: [], firstSaleAt: daysAgo(120) });
    const row = standingRows(m, [{ kind: "large_order", severity: "warning" }]).find((x) => x.key === "price")!;
    expect(row).toMatchObject({ state: "needs_you", figure: "Average order 1.0× the 28-day average · a large order from an earlier check is still open" });
  });

  it("a dispute rate above 1% is shown, never turned into 'needs you'", () => {
    const r = rowsFor(steady(28, 1, 2, 20), 120, [daysAgo(3), daysAgo(4)]);
    expect(r.complaints).toMatchObject({ state: "context", figure: "2 of 56 orders disputed (3.5%)" });
  });
});
