import type { Alert } from "@/lib/alerts/engine";
import { THRESHOLDS, type Metrics } from "@/lib/metrics/compute";
import { factsFrom, type Fact, type FactSource } from "@/lib/pack/facts";
import { CLASSIFIABLE } from "@/lib/policy/clauses";

// The only statements Ask Standing can make: rendered here by code from computed metrics, open alerts,
// policy clauses and evidence. The model picks from these by ID; it can't state a number of its own.

const usd = (cents: number) => `USD ${(cents / 100).toFixed(2)}`;
const times = (r: number) => `${(Math.floor(r * 10) / 10).toFixed(1)}×`; // round down: never overstate
const pct = (r: number) => `${(Math.floor(r * 1000) / 10).toFixed(1)}%`;
const fact = (id: string, text: string): Fact => ({ id, evidenceIds: [], text, simulated: false });

export function metricFacts(m: Metrics): Fact[] {
  const out: Fact[] = [];
  out.push(
    fact(
      "M-HISTORY",
      m.history.firstSaleAt
        ? `Sales history: first sale on ${m.history.firstSaleAt.slice(0, 10)}, ${Math.floor(m.history.days)} days ago${m.history.newSeller ? " (new seller: under 7 days)" : ""}.`
        : "Sales history: no sales yet.",
    ),
  );
  const s = m.spike;
  out.push(
    fact(
      "M-SPIKE",
      s.status === "not_enough_history"
        ? `Spike ratio: not enough history yet (last 24 hours: ${usd(s.last24hCents)}).`
        : s.ratio === null
          ? `Spike ratio: no sales in the baseline period (last 24 hours: ${usd(s.last24hCents)}).`
          : `Spike ratio: ${times(s.ratio)} (last 24 hours ${usd(s.last24hCents)}; average day over the previous ${Math.floor(s.baselineDays)} days ${usd(s.baselineDailyMeanCents)}). Standing alerts at ${THRESHOLDS.spikeRatio}×, its own default, not a PayPal rule.`,
    ),
  );
  const t = m.avgTicket;
  out.push(
    fact(
      "M-TICKET",
      t.ratio === null
        ? "Average order: no orders in the last 7 days."
        : `Average order: ${usd(t.avg7dCents!)} over the last 7 days (${t.orders7d} orders), ${usd(t.avg28dCents!)} over the last 28 days (${t.orders28d} orders): ${times(t.ratio)}.`,
    ),
  );
  const p = m.newProductTypes;
  out.push(
    fact(
      "M-NEWTYPE",
      p.status === "not_enough_history"
        ? "New product types: not enough history yet."
        : p.newCategories.length
          ? `New product types in the last 7 days: ${p.newCategories.join(", ")}.`
          : "New product types in the last 7 days: none.",
    ),
  );
  const c = m.trackingCoverage;
  out.push(
    fact(
      "M-TRACKING",
      c.coverage === null
        ? `Tracking coverage: no classified physical orders older than 48 hours (${c.unclassifiedOrders} orders unclassified).`
        : `Tracking coverage: ${c.withTracking} of ${c.eligible} physical orders older than 48 hours have tracking (${pct(c.coverage)}); ${c.unclassifiedOrders} orders unclassified.`,
    ),
  );
  const g = m.digitalCompletionGap;
  out.push(fact("M-DIGITAL", g.count ? `Digital or service orders over 24 hours old not marked Completed: ${g.count} (${g.orders.join(", ")}).` : "Digital or service orders over 24 hours old not marked Completed: none."));
  const d = m.disputeRate90d;
  out.push(
    fact(
      "M-DISPUTES",
      d.rate === null ? "Dispute rate (90 days): no orders. PayPal publishes no exact threshold." : `Dispute rate (90 days): ${d.disputes} disputes in ${d.orders} orders (${pct(d.rate)}). PayPal publishes no exact threshold.`,
    ),
  );
  return out;
}

export const alertFacts = (open: Pick<Alert, "kind" | "title" | "message">[]): Fact[] => open.map((a) => fact(`A-${a.kind}`, `Open alert, ${a.title}: ${a.message}`));

export const clauseFacts = (): Fact[] =>
  CLASSIFIABLE.map((c) => fact(`C-${c.id}`, `PayPal Acceptable Use Policy ${c.id} (${c.kind === "preapproval" ? "needs pre-approval" : "prohibited"}, ${c.name}): ${c.lead_in ? `${c.lead_in} ` : ""}${c.text}`));

export function askFacts(input: { metrics: Metrics; alerts: Pick<Alert, "kind" | "title" | "message">[]; evidence: FactSource[] }): Fact[] {
  return [...metricFacts(input.metrics), ...alertFacts(input.alerts), ...clauseFacts(), ...factsFrom(input.evidence)];
}
