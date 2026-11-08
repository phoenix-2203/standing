import { type AlertCondition, evaluate } from "@/lib/alerts/rules";
import { computeMetrics, DAY, HOUR, type Sale, THRESHOLDS } from "@/lib/metrics/compute";

// "Would this spike stand out?" on the public page. It doesn't re-implement anything: it builds an example sales
// history from three numbers and runs it through the dashboard's own computeMetrics() and evaluate().
//
// The example seller: selling for 60 days, one order a day of the normal day's amount (so a normal day is one typical
// order). Today's sales are split into orders of that same size; if a largest single order is given, it is one of
// today's orders and the rest is split as before. Every order is a tracked physical product in one category, so only
// the spike and order-size signals can fire, as on a quiet dashboard.

export interface SpikeInput {
  normalDay: number; // USD
  today: number; // USD
  largestOrder?: number | null; // USD, part of today's sales
}

export interface SpikeResult {
  ratio: number; // today ÷ the normal day, as the dashboard computes it
  signals: Pick<AlertCondition, "kind" | "title" | "message">[];
  threshold: number;
}

export const SPIKE_KINDS = ["spike", "avg_ticket", "large_order"] as const;
const AS_OF = new Date("2026-01-31T12:00:00Z"); // fixed, so the example never depends on today's date

export function exampleSales({ normalDay, today, largestOrder }: SpikeInput): Sale[] {
  const cents = (usd: number) => Math.round(usd * 100);
  const sales: Sale[] = [];
  let n = 0;
  const add = (hoursAgo: number, c: number) => {
    if (c <= 0) return;
    sales.push({ id: `EXAMPLE-${++n}`, at: new Date(AS_OF.getTime() - hoursAgo * HOUR), cents: c, kind: "physical", categories: ["example"], hasTracking: true, completed: false });
  };
  for (let d = 60; d >= 1; d--) add(d * 24 + 1, cents(normalDay));

  let rest = cents(today);
  const large = largestOrder ? Math.min(cents(largestOrder), rest) : 0;
  if (large > 0) {
    add(1, large);
    rest -= large;
  }
  const unit = Math.max(1, cents(normalDay));
  for (let i = 0; rest > 0; i++) {
    add(2 + (i % 20) * 0.5, Math.min(unit, rest));
    rest -= unit;
  }
  return sales;
}

export function checkSpike(input: SpikeInput): SpikeResult | null {
  if (!(input.normalDay > 0) || !(input.today >= 0)) return null;
  const sales = exampleSales(input);
  const m = computeMetrics({ asOf: AS_OF, sales, disputeCreatedAt: [], firstSaleAt: new Date(AS_OF.getTime() - 61 * DAY) });
  const signals = evaluate(m)
    .filter((a) => (SPIKE_KINDS as readonly string[]).includes(a.kind))
    .map(({ kind, title, message }) => ({ kind, title, message: message.replace(/Order EXAMPLE-\d+/, "One order") }));
  return { ratio: m.spike.ratio ?? 0, signals, threshold: THRESHOLDS.spikeRatio };
}
