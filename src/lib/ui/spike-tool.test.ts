import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/alerts/rules";
import { computeMetrics, DAY } from "@/lib/metrics/compute";
import { checkSpike, exampleSales, type SpikeInput } from "./spike-tool";

// The public tool must say exactly what the dashboard's own engine says for the same sales.
const AS_OF = new Date("2026-01-31T12:00:00Z");
function engine(input: SpikeInput) {
  const m = computeMetrics({ asOf: AS_OF, sales: exampleSales(input), disputeCreatedAt: [], firstSaleAt: new Date(AS_OF.getTime() - 61 * DAY) });
  return { m, alerts: evaluate(m) };
}

describe("spike tool", () => {
  it.each<SpikeInput>([
    { normalDay: 100, today: 100 },
    { normalDay: 100, today: 299 },
    { normalDay: 100, today: 300 },
    { normalDay: 40, today: 1250 },
    { normalDay: 100, today: 250, largestOrder: 150 },
    { normalDay: 36, today: 216, largestOrder: 180 },
    { normalDay: 50, today: 0 },
  ])("matches evaluate() for %o", (input) => {
    const { m, alerts } = engine(input);
    const r = checkSpike(input)!;
    expect(r.ratio).toBe(m.spike.ratio);
    expect(r.signals.map((s) => s.kind)).toEqual(alerts.filter((a) => ["spike", "avg_ticket", "large_order"].includes(a.kind)).map((a) => a.kind));
    // No other signal can fire for the example seller, so nothing is hidden by the filter.
    expect(alerts.every((a) => ["spike", "avg_ticket", "large_order"].includes(a.kind))).toBe(true);
  });

  it("today equal to a normal day is 1.0× and raises nothing", () => {
    const r = checkSpike({ normalDay: 100, today: 100 })!;
    expect(r.ratio).toBeCloseTo(1, 10);
    expect(r.signals).toEqual([]);
  });

  it("3× a normal day raises the spike signal with the dashboard's wording", () => {
    const r = checkSpike({ normalDay: 100, today: 300 })!;
    expect(r.signals.map((s) => s.kind)).toEqual(["spike"]);
    expect(r.signals[0].message).toContain("are 3.0× your average day");
  });

  it("just under 3× doesn't", () => {
    expect(checkSpike({ normalDay: 100, today: 299 })!.signals).toEqual([]);
  });

  it("one large order is named without an internal ID", () => {
    const r = checkSpike({ normalDay: 36, today: 286, largestOrder: 250 })!; // 250 ÷ the 28-day average incl. today (43.38) = 5.76×
    const large = r.signals.find((s) => s.kind === "large_order")!;
    expect(large.message).toMatch(/^One order \(\$250\.00\) is 5\.7× your 28-day average order/);
    expect(large.message).not.toContain("EXAMPLE");
  });

  it("nonsense input gives no result rather than a guess", () => {
    expect(checkSpike({ normalDay: 0, today: 100 })).toBeNull();
    expect(checkSpike({ normalDay: Number.NaN, today: 100 })).toBeNull();
    expect(checkSpike({ normalDay: 100, today: -5 })).toBeNull();
  });
});
