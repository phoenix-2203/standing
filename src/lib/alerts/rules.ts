import { type Metrics, THRESHOLDS } from "@/lib/metrics/compute";

// Alert rules over computed metrics. Deterministic: the numbers and wording come from code, never from
// the AI (CLAUDE.md rule 3). Messages state facts and PayPal's *published* reasons; they never predict
// what PayPal will do.

export type AlertKind = "spike" | "avg_ticket" | "large_order" | "new_product_type" | "tracking_coverage" | "digital_gap";

export interface AlertCondition {
  kind: AlertKind;
  title: string;
  message: string;
  facts: Record<string, unknown>;
}

export const THRESHOLD_NOTE = "Thresholds are Standing's defaults, not PayPal rules.";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const times = (r: number) => `${(Math.floor(r * 10) / 10).toFixed(1)}×`; // round down: never overstate

/** Every condition currently true. The 90-day dispute rate is shown but never alerts: PayPal publishes no threshold. */
export function evaluate(m: Metrics): AlertCondition[] {
  const out: AlertCondition[] = [];

  if (m.spike.ratio !== null && m.spike.ratio >= THRESHOLDS.spikeRatio) {
    out.push({
      kind: "spike",
      title: "Sales spike",
      message:
        `Sales in the last 24 hours (${usd(m.spike.last24hCents)}) are ${times(m.spike.ratio)} your average day ` +
        `over the previous 28 days (${usd(m.spike.baselineDailyMeanCents)}). PayPal lists a spike in sales among ` +
        `the reasons it may hold funds.`,
      facts: { ...m.spike, threshold: THRESHOLDS.spikeRatio },
    });
  }

  const t = m.avgTicket;
  if (t.ratio !== null && t.ratio >= THRESHOLDS.avgTicketRatio) {
    out.push({
      kind: "avg_ticket",
      title: "Average order value jumped",
      message:
        `Your average order over the last 7 days (${usd(t.avg7dCents!)}) is ${times(t.ratio)} your 28-day average ` +
        `(${usd(t.avg28dCents!)}). PayPal lists a change in average selling price among the reasons it may hold funds.`,
      facts: { avg7dCents: t.avg7dCents, avg28dCents: t.avg28dCents, ratio: t.ratio, threshold: THRESHOLDS.avgTicketRatio },
    });
  }
  if (t.largestRecent && t.largestRecent.multiple >= THRESHOLDS.singleOrderMultiple) {
    out.push({
      kind: "large_order",
      title: "Unusually large order",
      message:
        `Order ${t.largestRecent.id} (${usd(t.largestRecent.cents)}) is ${times(t.largestRecent.multiple)} your ` +
        `28-day average order (${usd(t.avg28dCents!)}).`,
      facts: { ...t.largestRecent, avg28dCents: t.avg28dCents, threshold: THRESHOLDS.singleOrderMultiple },
    });
  }

  const p = m.newProductTypes;
  if (p.newCategories.length) {
    out.push({
      kind: "new_product_type",
      title: "New type of product",
      message:
        `You sold ${list(p.newCategories)} in the last 7 days but not in the 60 days before. PayPal lists a change ` +
        `in the type of item sold among the reasons it may hold funds.`,
      facts: { newCategories: p.newCategories },
    });
  }

  const c = m.trackingCoverage;
  if (c.coverage !== null && c.coverage < THRESHOLDS.trackingCoverage) {
    out.push({
      kind: "tracking_coverage",
      title: "Orders missing tracking",
      message:
        `${c.eligible - c.withTracking} of ${c.eligible} physical orders older than 48 hours have no tracking in PayPal ` +
        `(${Math.floor(c.coverage * 100)}% covered).`,
      facts: { eligible: c.eligible, withTracking: c.withTracking, coverage: c.coverage, missing: c.missing, threshold: THRESHOLDS.trackingCoverage },
    });
  }

  const g = m.digitalCompletionGap;
  if (g.count >= THRESHOLDS.digitalGap) {
    out.push({
      kind: "digital_gap",
      title: "Digital orders not marked Completed",
      message: `${g.count} digital or service ${g.count === 1 ? "order is" : "orders are"} more than 24 hours old and not marked Completed in PayPal.`,
      facts: { count: g.count, orders: g.orders },
    });
  }

  return out;
}

function list(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
}
