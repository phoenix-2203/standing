import { type Metrics, MIN_HISTORY_DAYS, THRESHOLDS } from "@/lib/metrics/compute";

// Alert rules over computed metrics. Deterministic: the numbers and wording come from code, never from
// the AI (CLAUDE.md rule 3). Messages state facts and PayPal's *published* reasons; they never predict
// what PayPal will do.

export type AlertKind =
  | "new_seller"
  | "spike"
  | "expected_spike"
  | "avg_ticket"
  | "large_order"
  | "new_product_type"
  | "tracking_coverage"
  | "digital_gap";

export interface AlertCondition {
  kind: AlertKind;
  // "info" = a calm status note (e.g. new seller); "warning" = a signal to act on.
  severity: "info" | "warning";
  link?: string;
  title: string;
  message: string;
  facts: Record<string, unknown>;
}

/** The launch plan whose window includes now. */
export interface PlanContext {
  launchDate: string;
  expectedMultiple: number;
  packId: string | null; // set only when the pre-built pack passed validation
  flaggedProducts: string[]; // launch products whose policy check isn't "allowed"
}

export const THRESHOLD_NOTE = "Thresholds are Standing's defaults, not PayPal rules.";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const times = (r: number) => `${(Math.floor(r * 10) / 10).toFixed(1)}×`; // round down: never overstate

/** Every condition currently true. The 90-day dispute rate is shown but never alerts: PayPal publishes no threshold. */
export function evaluate(m: Metrics, plan: PlanContext | null = null): AlertCondition[] {
  const out: AlertCondition[] = [];

  if (m.history.newSeller) {
    const days = Math.floor(m.history.days);
    const ago = days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
    const when = m.history.firstSaleAt === null ? "You haven't had a sale yet." : `Your first sale was ${ago}.`;
    out.push({
      kind: "new_seller",
      severity: "info",
      link: "/checklist",
      title: "New seller",
      message:
        `${when} PayPal lists being a first-time seller as the first reason it may hold funds. Nothing is wrong; ` +
        `the checklist shows what to have ready. Some signals need ${MIN_HISTORY_DAYS} days of sales history first.`,
      facts: { ...m.history },
    });
  }

  if (m.spike.ratio !== null && m.spike.ratio >= THRESHOLDS.spikeRatio) {
    const base =
      `Sales in the last 24 hours (${usd(m.spike.last24hCents)}) are ${times(m.spike.ratio)} your average day ` +
      `over the previous ${Math.floor(m.spike.baselineDays)} days (${usd(m.spike.baselineDailyMeanCents)}). PayPal lists a spike in sales among ` +
      `the reasons it may hold funds.`;
    const facts = { ...m.spike, threshold: THRESHOLDS.spikeRatio, plan };
    const planned = `${plan?.expectedMultiple}× you planned for your launch on ${plan?.launchDate}`;
    if (plan && plan.flaggedProducts.length) {
      out.push({ kind: "spike", severity: "warning", title: "Sales spike", message: `${base} Your launch plan has products that need attention first: ${list(plan.flaggedProducts)}.`, facts });
    } else if (plan && m.spike.ratio <= plan.expectedMultiple) {
      // Inside the plan. Calm only if the seller's case really is ready.
      out.push(
        plan.packId
          ? { kind: "expected_spike", severity: "info", link: `/api/packs/${plan.packId}/pdf`, title: "Expected spike: pack ready", message: `${base} This is within the ${planned}, and your explanation pack is ready.`, facts }
          : { kind: "expected_spike", severity: "warning", title: "Expected spike: pack not ready", message: `${base} This is within the ${planned}, but your explanation pack isn't ready yet.`, facts },
      );
    } else if (plan) {
      out.push({ kind: "spike", severity: "warning", title: "Sales spike above your launch plan", message: `${base} That's more than the ${planned}.`, facts });
    } else {
      out.push({ kind: "spike", severity: "warning", title: "Sales spike", message: base, facts });
    }
  }

  const t = m.avgTicket;
  if (t.ratio !== null && t.ratio >= THRESHOLDS.avgTicketRatio) {
    out.push({
      kind: "avg_ticket",
      severity: "warning",
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
      severity: "warning",
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
      severity: "warning",
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
      severity: "warning",
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
      severity: "warning",
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
