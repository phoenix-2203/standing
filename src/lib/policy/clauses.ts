import data from "../../../data/policy_clauses.json";

export type ClauseKind = "prohibited" | "preapproval";

export interface Clause {
  id: string;
  kind: ClauseKind;
  name: string;
  text: string;
  lead_in?: string;
  source_url: string;
  policy_last_updated: string;
  retrieved: string;
}

export const CLAUSES = data.clauses as Clause[];
export const POLICY_SOURCE = { url: data.source_url, lastUpdated: data.policy_last_updated, retrieved: data.retrieved };

// Clauses offered to the classifier. PROH-5 ("pre-approval activity without approval") is a rule about
// the pre-approval list, not a product category: a product needing pre-approval gets verdict
// `preapproval` with its PRE-xx clause instead.
export const CLASSIFIABLE = CLAUSES.filter((c) => c.id !== "PROH-5");

const byId = new Map(CLAUSES.map((c) => [c.id, c]));
export const clauseById = (id: string) => byId.get(id);

export const normalizeSpace = (s: string) => s.replace(/\s+/g, " ").trim();
