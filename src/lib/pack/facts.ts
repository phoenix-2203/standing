// The only factual sentences a pack can contain. Each one is rendered here, by code, from a template and
// the values in an evidence item: the model never writes a count, amount, date or status (CLAUDE.md
// rules 3 and 6). Ledger items already carry a code-written summary; the EV-SUM summary is split into
// one fact per figure so the model can pick only the ones it needs.

export interface FactSource {
  id: string;
  kind: string;
  summary: string;
  simulated: boolean;
  facts: Record<string, unknown>;
}

export interface Fact {
  id: string;
  evidenceIds: string[];
  text: string;
  simulated: boolean;
}

// Label style ("…: 1 of 31") reads correctly for any count, so no plural logic is needed.
export const SUMMARY_TEMPLATES: Record<string, string> = {
  orders: "PayPal payments received between {from} and {to}: {orders}, totalling {total}.",
  busiest: "Busiest day: {busiestDay}, with {busiestDayOrders} of those payments, totalling {busiestDayTotal}.",
  tracking: "Payments with tracking in PayPal: {ordersWithTracking} of {orders}.",
  completed: "Payments marked Completed in PayPal: {ordersCompleted} of {orders}.",
  disputes: "Disputes opened in the period: {disputesOpened}.",
};

/** Fill `{name}` placeholders; a missing value is a bug, never a blank in a letter. */
export function render(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = values[k];
    if (v === undefined || v === null || v === "") throw new Error(`Missing value "${k}" for template: ${template}`);
    return String(v);
  });
}

export function factsFrom(evidence: FactSource[]): Fact[] {
  return evidence.flatMap((e): Fact[] => {
    if (e.kind === "sales_summary") {
      return Object.entries(SUMMARY_TEMPLATES).map(([key, template]) => ({
        id: `${e.id}#${key}`,
        evidenceIds: [e.id],
        text: render(template, e.facts),
        simulated: e.simulated,
      }));
    }
    // Ledger summaries are written by code from stored data and start with "Simulated: " when simulated.
    return [{ id: e.id, evidenceIds: [e.id], text: e.summary, simulated: e.simulated }];
  });
}
