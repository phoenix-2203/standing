import { type Metrics, MIN_HISTORY_DAYS, THRESHOLDS } from "@/lib/metrics/compute";

// "Where you stand": one row per reason PayPal publishes for holding funds (plus PayPal's own advice and
// one check of Standing's), each with the seller's figure now, Standing's threshold and a state.
// Plain code (CLAUDE.md rule 3). A row's state comes from the same open alerts the dashboard lists, so the
// table and the "Needs you" list can't disagree. Never a single score, and never PayPal's decision.

// "next_check": the live figure is past Standing's line but the 15-minute check hasn't raised its alert yet
// (e.g. right after the seller catalogues products). Never shown as Clear in that gap.
export type RowState = "needs_you" | "next_check" | "expected" | "applies" | "clear" | "no_history" | "no_data" | "context";

export interface StandingRow {
  key: string;
  reason: string; // what PayPal lists, in plain words
  source: "PayPal's published reason" | "PayPal's advice" | "Standing's check";
  figure: string; // the seller's number now, computed here
  threshold: string; // what Standing compares it with
  state: RowState;
}

interface OpenAlert {
  kind: string;
  severity: string;
}

const usd = (cents: number) => `USD ${(cents / 100).toFixed(2)}`;
const times = (r: number) => `${(Math.floor(r * 10) / 10).toFixed(1)}×`; // round down: never overstate
const pct = (r: number) => `${Math.floor(r * 100)}%`;

export function standingRows(m: Metrics, open: OpenAlert[]): StandingRow[] {
  const warn = (...kinds: string[]) => open.some((a) => kinds.includes(a.kind) && a.severity === "warning");
  const calm = (...kinds: string[]) => open.some((a) => kinds.includes(a.kind) && a.severity !== "warning");
  const days = Math.floor(m.history.days);

  const spike: StandingRow = {
    key: "spike",
    reason: "A sudden spike in sales",
    source: "PayPal's published reason",
    figure:
      m.spike.status === "not_enough_history" || m.spike.ratio === null
        ? `Last 24 h ${usd(m.spike.last24hCents)}`
        : `${times(m.spike.ratio)} an average day (last 24 h ${usd(m.spike.last24hCents)})`,
    threshold: `Warns at ${THRESHOLDS.spikeRatio}× an average day`,
    state: warn("spike", "expected_spike") ? "needs_you" : calm("expected_spike") ? "expected" : m.spike.status === "not_enough_history" ? "no_history" : "clear",
  };

  const t = m.avgTicket;
  const largeNow = !!t.largestRecent && t.largestRecent.multiple >= THRESHOLDS.singleOrderMultiple;
  const priceNow = largeNow
    ? `One order is ${times(t.largestRecent!.multiple)} your average order`
    : t.ratio === null
      ? "No orders in the last 7 days"
      : `Average order ${times(t.ratio)} the 28-day average`;
  const price: StandingRow = {
    key: "price",
    reason: "A change in average selling price",
    source: "PayPal's published reason",
    // An alert stays open until the seller deals with it, so say why the row still needs them.
    figure: !largeNow && warn("large_order") ? `${priceNow} · a large order from an earlier check is still open` : priceNow,
    threshold: `Warns at ${THRESHOLDS.avgTicketRatio}× on average, or one order at ${THRESHOLDS.singleOrderMultiple}×`,
    state: warn("avg_ticket", "large_order") ? "needs_you" : t.ratio === null ? "no_data" : "clear",
  };

  const p = m.newProductTypes;
  const itemType: StandingRow = {
    key: "item_type",
    reason: "A change in the type of item sold",
    source: "PayPal's published reason",
    figure: p.newCategories.length
      ? `New in the last 7 days: ${p.newCategories.join(", ")}`
      : p.uncategorizedRecentOrders
        ? `${p.uncategorizedRecentOrders} recent ${p.uncategorizedRecentOrders === 1 ? "order isn't" : "orders aren't"} in your catalogue`
        : "No new types",
    threshold: "Warns on a type not sold in the 60 days before",
    state: warn("new_product_type") ? "needs_you" : p.status === "not_enough_history" ? "no_history" : "clear",
  };

  const firstTime: StandingRow = {
    key: "first_time",
    reason: "Being a first-time seller",
    source: "PayPal's published reason",
    figure: m.history.firstSaleAt === null ? "No sales yet" : days === 0 ? "First sale today" : `First sale ${days} ${days === 1 ? "day" : "days"} ago`,
    threshold: `Some checks need ${MIN_HISTORY_DAYS} days of sales history`,
    state: m.history.newSeller ? "applies" : "clear",
  };

  const c = m.trackingCoverage;
  const tracking: StandingRow = {
    key: "tracking",
    reason: "Valid tracking on shipped orders",
    source: "PayPal's advice",
    figure: c.coverage === null ? `No catalogued physical orders due · ${c.unclassifiedOrders} not in your catalogue` : `${c.withTracking} of ${c.eligible} tracked (${pct(c.coverage)})`,
    threshold: `Warns below ${pct(THRESHOLDS.trackingCoverage)}, orders over 48 h`,
    state: warn("tracking_coverage") ? "needs_you" : c.coverage === null ? "no_data" : c.coverage < THRESHOLDS.trackingCoverage ? "next_check" : "clear",
  };

  const g = m.digitalCompletionGap;
  const digital: StandingRow = {
    key: "digital",
    reason: "Digital orders marked Completed",
    source: "Standing's check",
    figure: g.count === 0 ? "None waiting" : `${g.count} waiting over 24 h`,
    threshold: "Warns on any digital order over 24 h",
    state: warn("digital_gap") ? "needs_you" : g.count >= THRESHOLDS.digitalGap ? "next_check" : "clear",
  };

  // PayPal's guide advises complaints below 1% of sales. Standing's 90-day dispute rate isn't the same
  // measure, so it is shown for context and never raises "needs you".
  const d = m.disputeRate90d;
  const complaints: StandingRow = {
    key: "complaints",
    reason: "Complaints kept low",
    source: "PayPal's advice",
    figure: d.rate === null ? "No orders in 90 days" : `${d.disputes} of ${d.orders} orders disputed (${(Math.floor(d.rate * 1000) / 10).toFixed(1)}%)`,
    threshold: "Shown only; PayPal's guide advises below 1% of sales",
    state: d.rate === null ? "no_data" : "context",
  };

  return [spike, price, itemType, firstTime, tracking, digital, complaints];
}
