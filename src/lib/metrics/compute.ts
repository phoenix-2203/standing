// Deterministic metrics from BLUEPRINT §4 (CLAUDE.md rule 3: plain code owns numbers).
// Thresholds are Standing's own defaults, not PayPal rules — the UI must say so.
//
// Conventions (applied everywhere):
// - Windows are rolling and relative to `asOf`, half-open: (asOf − N, asOf]. "Day" = 24 h, no time zones.
// - Money is integer cents; ratios are plain numbers. A ratio with a zero denominator is null (no data),
//   never 0 or Infinity, and a null metric never fires an alert.
// - "Order" = a sale: see isSale() in load.ts.

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

// Orders older than this aren't loaded at all. Tracking coverage and the digital gap say "all such
// orders"; in practice that means all orders in this history, which matches the sync's 90-day backfill.
export const HISTORY_DAYS = 90;

export const THRESHOLDS = {
  spikeRatio: 3, // last-24h gross ≥ 3× the previous 28 days' mean daily gross
  avgTicketRatio: 2, // 7-day avg order ≥ 2× 28-day avg
  singleOrderMultiple: 5, // any order in the last 7 days ≥ 5× the 28-day avg
  trackingCoverage: 0.9, // alert below 90%
  digitalGap: 1, // any digital/service order > 24 h old not marked Completed
} as const;

export type Kind = "physical" | "digital" | "service";

export interface Sale {
  id: string;
  at: Date;
  cents: number;
  // From the seller's catalogue; null when no line item matched a product.
  kind: Kind | null;
  categories: string[];
  hasTracking: boolean;
  completed: boolean;
}

export interface MetricsInput {
  asOf: Date;
  sales: Sale[];
  disputeCreatedAt: Date[];
}

export interface Metrics {
  asOf: string;
  spike: { last24hCents: number; baselineDailyMeanCents: number; ratio: number | null };
  avgTicket: {
    orders7d: number;
    orders28d: number;
    avg7dCents: number | null;
    avg28dCents: number | null;
    ratio: number | null;
    largestRecent: { id: string; cents: number; multiple: number } | null;
  };
  newProductTypes: { newCategories: string[]; recentCategories: string[]; uncategorizedRecentOrders: number };
  trackingCoverage: { eligible: number; withTracking: number; coverage: number | null; missing: string[]; unclassifiedOrders: number };
  digitalCompletionGap: { count: number; orders: string[] };
  disputeRate90d: { disputes: number; orders: number; rate: number | null };
}

export function computeMetrics({ asOf, sales, disputeCreatedAt }: MetricsInput): Metrics {
  const t = asOf.getTime();
  const within = (at: Date, from: number, to = t) => at.getTime() > from && at.getTime() <= to;
  const inLast = (ms: number) => sales.filter((s) => within(s.at, t - ms));
  const sum = (xs: Sale[]) => xs.reduce((a, s) => a + s.cents, 0);
  const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

  // Spike ratio = last-24h gross ÷ mean daily gross of the previous 28 days (excluding the last 24 h).
  const last24 = sum(inLast(DAY));
  const prev28 = sum(sales.filter((s) => within(s.at, t - 29 * DAY, t - DAY)));
  const baselineDailyMean = prev28 / 28;

  // Average ticket change = 7-day avg order ÷ 28-day avg (the 28 days include the last 7).
  const last7 = inLast(7 * DAY);
  const last28 = inLast(28 * DAY);
  const avg7 = last7.length ? sum(last7) / last7.length : null;
  const avg28 = last28.length ? sum(last28) / last28.length : null;
  const largest = last7.reduce<Sale | null>((m, s) => (!m || s.cents > m.cents ? s : m), null);

  // New product type = category sold in the last 7 days, not sold in the 60 days before that.
  const recentCats = new Set(last7.flatMap((s) => s.categories));
  const priorCats = new Set(sales.filter((s) => within(s.at, t - 67 * DAY, t - 7 * DAY)).flatMap((s) => s.categories));

  // Tracking coverage = physical orders > 48 h old with tracking ÷ all such orders.
  const history = sales.filter((s) => within(s.at, t - HISTORY_DAYS * DAY));
  const physicalDue = history.filter((s) => s.kind === "physical" && s.at.getTime() <= t - 48 * HOUR);
  const tracked = physicalDue.filter((s) => s.hasTracking);

  // Digital completion gap = digital (or service) orders > 24 h old not marked Completed.
  const digitalGap = history.filter((s) => (s.kind === "digital" || s.kind === "service") && s.at.getTime() <= t - DAY && !s.completed);

  // Dispute rate (90 d) = disputes opened ÷ orders, both in the last 90 days.
  const orders90 = history.length;
  const disputes90 = disputeCreatedAt.filter((d) => within(d, t - 90 * DAY)).length;

  return {
    asOf: asOf.toISOString(),
    spike: { last24hCents: last24, baselineDailyMeanCents: baselineDailyMean, ratio: ratio(last24, baselineDailyMean) },
    avgTicket: {
      orders7d: last7.length,
      orders28d: last28.length,
      avg7dCents: avg7,
      avg28dCents: avg28,
      ratio: avg7 !== null && avg28 !== null ? ratio(avg7, avg28) : null,
      largestRecent: largest && avg28 ? { id: largest.id, cents: largest.cents, multiple: largest.cents / avg28 } : null,
    },
    newProductTypes: {
      newCategories: [...recentCats].filter((c) => !priorCats.has(c)).sort(),
      recentCategories: [...recentCats].sort(),
      uncategorizedRecentOrders: last7.filter((s) => s.categories.length === 0).length,
    },
    trackingCoverage: {
      eligible: physicalDue.length,
      withTracking: tracked.length,
      coverage: ratio(tracked.length, physicalDue.length),
      missing: physicalDue.filter((s) => !s.hasTracking).map((s) => s.id),
      unclassifiedOrders: history.filter((s) => s.kind === null).length,
    },
    digitalCompletionGap: { count: digitalGap.length, orders: digitalGap.map((s) => s.id) },
    disputeRate90d: { disputes: disputes90, orders: orders90, rate: ratio(disputes90, orders90) },
  };
}

/** "18.10" → 1810, exactly (no float parsing). */
export function toCents(value: string): number {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new Error(`Not a money amount: ${JSON.stringify(value)}`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -cents : cents;
}
