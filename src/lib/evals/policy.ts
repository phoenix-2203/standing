import { readFileSync } from "node:fs";
import path from "node:path";
import type { Classification, Verdict } from "@/lib/policy/classify";
import { VERDICTS } from "@/lib/policy/classify";
import { parseCsv } from "./csv";

// Policy-check eval (BLUEPRINT §7): target ≥90% of prohibited + pre-approval products caught; report misses.

export type Group = "allowed" | "preapproval" | "prohibited" | "tricky";
export const GROUPS: Group[] = ["allowed", "preapproval", "prohibited", "tricky"];

export interface EvalProduct {
  id: string;
  group: Group;
  name: string;
  description: string;
  expectedVerdict: Verdict;
  // Any of these clauses is a correct citation (most products have one; a few have two).
  expectedClauseIds: string[];
  note: string;
}

export interface EvalResult {
  product: EvalProduct;
  got: Classification | null; // null = every provider failed for this product
  error?: string;
}

export function loadEvalProducts(file = path.join(process.cwd(), "data/eval_products.csv")): EvalProduct[] {
  return parseCsv(readFileSync(file, "utf8")).map((r) => ({
    id: r.id,
    group: r.group as Group,
    name: r.name,
    description: r.description,
    expectedVerdict: r.expected_verdict as Verdict,
    expectedClauseIds: r.expected_clause_id ? r.expected_clause_id.split("|").map((c) => c.trim()) : [],
    note: r.note,
  }));
}

export interface Row {
  label: string;
  n: number;
  verdictCorrect: number;
  clauseCorrect: number;
  clauseExpected: number;
  flagged: number;
}

export interface Score {
  rows: Row[];
  // Blueprint target: of products that need pre-approval or are prohibited, the share flagged
  // (prohibited, preapproval or unclear: anything that sends the seller to look).
  catchRate: { caught: number; of: number };
  falseFlags: { flagged: number; of: number }; // expected allowed, but flagged
  downgraded: number; // answers that failed validation
  failed: number; // no answer at all
  confusion: Record<Verdict, Record<Verdict | "error", number>>;
  misses: { id: string; name: string; expected: string; got: string; reason: string }[];
}

const clauseOk = (r: EvalResult) => r.product.expectedClauseIds.length > 0 && r.got?.clauseId != null && r.product.expectedClauseIds.includes(r.got.clauseId);
const flaggedVerdict = (v: Verdict | undefined) => v !== undefined && v !== "allowed";

export function score(results: EvalResult[]): Score {
  const row = (label: string, rs: EvalResult[]): Row => ({
    label,
    n: rs.length,
    verdictCorrect: rs.filter((r) => r.got?.verdict === r.product.expectedVerdict).length,
    clauseExpected: rs.filter((r) => r.product.expectedClauseIds.length).length,
    clauseCorrect: rs.filter((r) => clauseOk(r)).length,
    flagged: rs.filter((r) => flaggedVerdict(r.got?.verdict)).length,
  });
  const mustCatch = results.filter((r) => r.product.expectedVerdict === "prohibited" || r.product.expectedVerdict === "preapproval");
  const shouldPass = results.filter((r) => r.product.expectedVerdict === "allowed");
  const confusion = Object.fromEntries(
    VERDICTS.map((e) => [e, Object.fromEntries([...VERDICTS, "error"].map((g) => [g, 0]))]),
  ) as Score["confusion"];
  for (const r of results) confusion[r.product.expectedVerdict][r.got?.verdict ?? "error"]++;

  return {
    rows: [...GROUPS.map((g) => row(g, results.filter((r) => r.product.group === g))), row("all", results)],
    catchRate: { caught: mustCatch.filter((r) => flaggedVerdict(r.got?.verdict)).length, of: mustCatch.length },
    falseFlags: { flagged: shouldPass.filter((r) => flaggedVerdict(r.got?.verdict)).length, of: shouldPass.length },
    downgraded: results.filter((r) => r.got?.rejected).length,
    failed: results.filter((r) => !r.got).length,
    confusion,
    misses: results
      .filter((r) => r.got?.verdict !== r.product.expectedVerdict || (r.product.expectedClauseIds.length > 0 && !clauseOk(r)))
      .map((r) => ({
        id: r.product.id,
        name: r.product.name,
        expected: `${r.product.expectedVerdict}${r.product.expectedClauseIds.length ? ` ${r.product.expectedClauseIds.join(" or ")}` : ""}`,
        got: r.got ? `${r.got.verdict}${r.got.clauseId ? ` ${r.got.clauseId}` : ""}` : "error",
        reason: r.got?.rejected ? `failed validation: ${r.got.rejected.problem}` : (r.got?.reason ?? r.error ?? ""),
      })),
  };
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "—");

export function formatScore(s: Score, meta: string): string {
  const lines = [meta, "", "| Group | n | Verdict correct | Clause correct | Flagged |", "|---|---|---|---|---|"];
  for (const r of s.rows) {
    lines.push(
      `| ${r.label} | ${r.n} | ${r.verdictCorrect}/${r.n} (${pct(r.verdictCorrect, r.n)}) | ` +
        `${r.clauseExpected ? `${r.clauseCorrect}/${r.clauseExpected} (${pct(r.clauseCorrect, r.clauseExpected)})` : "—"} | ${r.flagged}/${r.n} |`,
    );
  }
  const { caught, of } = s.catchRate;
  lines.push(
    "",
    `Caught (prohibited + pre-approval flagged for review): ${caught}/${of} (${pct(caught, of)}), target ≥90%: ${of && caught / of >= 0.9 ? "MET" : "NOT MET"}`,
    `False flags on allowed products: ${s.falseFlags.flagged}/${s.falseFlags.of}`,
    `Answers that failed validation (downgraded to unclear): ${s.downgraded}; no answer: ${s.failed}`,
    "",
    "Confusion (rows = expected, columns = got):",
    `| | ${[...VERDICTS, "error"].join(" | ")} |`,
    `|---|${[...VERDICTS, "error"].map(() => "---").join("|")}|`,
    ...VERDICTS.map((e) => `| ${e} | ${[...VERDICTS, "error"].map((g) => s.confusion[e][g as Verdict]).join(" | ")} |`),
  );
  if (s.misses.length) {
    lines.push("", "Misses:");
    for (const m of s.misses) lines.push(`- ${m.id} ${m.name}: expected ${m.expected}, got ${m.got}. ${m.reason}`);
  }
  return lines.join("\n");
}
