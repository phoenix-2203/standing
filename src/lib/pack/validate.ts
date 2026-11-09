import type { Fact } from "./facts";

// Plan validator (CLAUDE.md rule 6). The model returns a plan: an ordered list of fact IDs and short
// connecting sentences. Facts are rendered by code (facts.ts), so a fact can't be misstated or
// recombined; the model's own text is limited to connecting sentences that carry no claim at all.
// Deterministic: the model has no say in whether a pack passes.

export interface PlanItem {
  kind: "fact" | "bridge";
  fact_id: string;
  text: string;
}
export interface Plan {
  paragraphs: { items: PlanItem[] }[];
}

export interface Sentence {
  kind: "fact" | "bridge";
  text: string;
  citations: string[]; // evidence IDs; empty for a connecting sentence, which states no fact
}
export interface RenderedLetter {
  paragraphs: { sentences: Sentence[] }[];
}

export interface Problem {
  paragraph: number;
  item: number;
  text: string;
  problem: string;
}
export interface Validation {
  ok: boolean;
  problems: Problem[];
  /** Connecting sentences left out of the letter (only with dropBadBridges). Never shown to anyone. */
  dropped?: Problem[];
}

const MAX_ITEMS = 40;
const MAX_BRIDGE_CHARS = 200;

const HIDDEN = /[​-‏‪-‮⁠-⁤﻿­]/;
const EVIDENCE_ID = /\bEV-[A-Z]+/i;
const NUMBER_WORDS =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen|half|once|twice|double|doubled|triple|tripled|several|many|few|most|all|every|none|no|single)\b/i;
const DATE_WORDS =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|yesterday|tomorrow|tonight|weekend|week|weeks|month|months|year|years|day|days|daily|weekly|monthly|recently|lately)\b/i;
// Claims about payments, orders, disputes, delivery and PayPal outcomes belong in facts, never in the
// model's own words.
const CLAIM_WORDS =
  /\b(pay|paid|payment|payments|payout|refund\w*|dispute\w*|chargeback\w*|claim\w*|deliver\w*|ship\w*|track\w*|dispatch\w*|complet\w*|order\w*|sale|sales|sold|sell|sells|selling|revenue|income|earn\w*|total\w*|spike\w*|increase\w*|grew|grow\w*|surge\w*|hold|held|holds|limit\w*|restrict\w*|releas\w*|restor\w*|approv\w*|lift\w*|freez\w*|frozen|suspend\w*|unlock\w*|fund|funds|money|balance|verified|legitimate|genuine|authentic|trusted|reliable|safe|fraud\w*|risk\w*|customer\w*|buyer\w*|invoice\w*|supplier\w*|stock|traffic|video\w*|viral)\b/i;

// Every word of a connecting sentence must come from here: linking and politeness words only.
const BRIDGE_WORDS = new Set(
  (
    "the a an and or of to in on for with by from at as is are was were be been this that these those it its " +
    "our we my i me us their they them which has have had also both each following below above here there such " +
    "so but because while when where what thank thanks you your please team teams account review reviewing " +
    "context explain explains explaining summary evidence fact facts listed list set out shows show showing " +
    "attached details detail information seller sellers shop store business would like help understand recent " +
    "activity letter describe describes overview first next finally then further additionally addition note " +
    "noted see records record paypal kind regards sincerely appreciate time consideration questions happy answer " +
    "any contact more relevant included includes including below set supporting support context background " +
    "outline outlines outlined points point key main can find documents document if"
  ).split(/\s+/),
);

/**
 * With `dropBadBridges`, a connecting sentence whose only fault is a word outside the allowed list (a harmless
 * linking phrase such as "Additional information follows.") is left out and listed in `dropped`, instead of
 * failing the plan. A sentence with a digit, number, date, claim, evidence ID or hidden character still fails
 * the plan, and so does any bad fact reference: those mean the model tried to state something. Used only
 * after the model has had its retries, so one stray linking phrase can't block a pack whose facts are sound.
 */
export function validatePlan(plan: unknown, facts: Fact[], { dropBadBridges = false } = {}): Validation & { letter: RenderedLetter | null } {
  const problems: Problem[] = [];
  const dropped: Problem[] = [];
  const add = (p: number, i: number, text: string, problem: string) => problems.push({ paragraph: p, item: i, text, problem });
  const fail = (problem: string) => ({ ok: false, problems: [{ paragraph: -1, item: -1, text: "", problem }], letter: null });

  const paragraphs = (plan as Plan | null)?.paragraphs;
  if (!Array.isArray(paragraphs) || !paragraphs.length) return fail("plan doesn't match the schema");

  const byId = new Map(facts.map((f) => [f.id, f]));
  const used = new Set<string>();
  const letter: RenderedLetter = { paragraphs: [] };
  let count = 0;

  paragraphs.forEach((para, p) => {
    const items = (para as { items?: unknown })?.items;
    if (!Array.isArray(items) || !items.length) return add(p, -1, "", "paragraph has no items");
    const sentences: Sentence[] = [];
    items.forEach((raw, i) => {
      count++;
      const item = (raw ?? {}) as Partial<PlanItem>;
      if ((item.kind !== "fact" && item.kind !== "bridge") || typeof item.fact_id !== "string" || typeof item.text !== "string") {
        return add(p, i, String(item.text ?? ""), "item doesn't match the schema");
      }
      if (item.kind === "fact") {
        // Exact match only: no trimming or case folding, so lookalikes and near-misses are refused.
        const fact = byId.get(item.fact_id);
        if (!fact) return add(p, i, item.fact_id, `unknown fact ID ${JSON.stringify(item.fact_id)}`);
        if (used.has(fact.id)) return add(p, i, item.fact_id, `fact ${fact.id} used twice`);
        used.add(fact.id);
        // Any text the model put on a fact item is discarded: the fact's own rendered text is what's shown.
        sentences.push({ kind: "fact", text: fact.text, citations: fact.evidenceIds });
        return;
      }
      const problem = bridgeProblem(item.text);
      if (problem && dropBadBridges && problem.startsWith(OUTSIDE_LIST)) return void dropped.push({ paragraph: p, item: i, text: item.text, problem });
      if (problem) return add(p, i, item.text, problem);
      sentences.push({ kind: "bridge", text: item.text.normalize("NFKC").trim(), citations: [] });
    });
    letter.paragraphs.push({ sentences });
  });

  if (count > MAX_ITEMS) problems.push({ paragraph: -1, item: -1, text: "", problem: `plan has ${count} items (max ${MAX_ITEMS})` });
  if (!used.size) problems.push({ paragraph: -1, item: -1, text: "", problem: "plan includes no facts" });
  const ok = problems.length === 0;
  return { ok, problems, ...(dropBadBridges ? { dropped } : {}), letter: ok ? closingLast(letter) : null };
}

// A sign-off ("Thank you for your time…", "Kind regards") is placed by code, not by the model: it always
// ends the letter, in its own paragraph, whatever order the plan gave. Only position changes; the text has
// already passed the connecting-sentence checks.
const CLOSING = /\b(thank|thanks|regards|sincerely|questions|appreciate)\b/i;

export function closingLast(letter: RenderedLetter): RenderedLetter {
  const closing: Sentence[] = [];
  const body = letter.paragraphs
    .map((para) => ({
      sentences: para.sentences.filter((s) => {
        if (s.kind === "bridge" && CLOSING.test(s.text)) {
          closing.push(s);
          return false;
        }
        return true;
      }),
    }))
    .filter((para) => para.sentences.length > 0);
  return { paragraphs: closing.length ? [...body, { sentences: closing }] : body };
}

/**
 * Code, not the model, decides that evidence the seller added (a supplier invoice, a traffic source) is always in
 * the letter: any such fact the plan left out is added as its own paragraph, before the sign-off. The sentences
 * are the facts' code-written text, cited to their own evidence, so nothing new is claimed.
 */
export function includeFacts(letter: RenderedLetter, required: Fact[]): RenderedLetter {
  const cited = new Set(letter.paragraphs.flatMap((p) => p.sentences.flatMap((s) => s.citations)));
  const missing = required.filter((f) => !f.evidenceIds.every((id) => cited.has(id)));
  if (!missing.length) return letter;
  return closingLast({ paragraphs: [...letter.paragraphs, { sentences: missing.map((f) => ({ kind: "fact" as const, text: f.text, citations: f.evidenceIds })) }] });
}

const OUTSIDE_LIST = "connecting sentence uses words outside the allowed list";

/** Why a connecting sentence the model wrote can't be used, or null if it can. */
export function bridgeProblem(raw: string): string | null {
  if (HIDDEN.test(raw)) return "contains hidden characters";
  const t = raw.normalize("NFKC").trim();
  if (!t) return "empty sentence";
  if (t.length > MAX_BRIDGE_CHARS) return "connecting sentence too long";
  if (/\d/.test(t)) return "connecting sentence contains a digit";
  if (EVIDENCE_ID.test(t)) return "connecting sentence contains an evidence ID";
  const num = t.match(NUMBER_WORDS);
  if (num) return `connecting sentence contains a number or quantity word ("${num[0]}")`;
  const date = t.match(DATE_WORDS);
  if (date) return `connecting sentence contains a date word ("${date[0]}")`;
  const claim = t.match(CLAIM_WORDS);
  if (claim) return `connecting sentence makes a claim ("${claim[0]}"); facts come only from the fact list`;
  const words = t.toLowerCase().replace(/'s\b/g, "").match(/[a-z]+/g) ?? [];
  const other = [...new Set(words.filter((w) => !BRIDGE_WORDS.has(w)))];
  if (other.length) return `${OUTSIDE_LIST} ("${other.join('", "')}")`;
  return null;
}
