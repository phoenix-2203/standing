import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/alerts/rules";
import { ASK_SYSTEM_PROMPT } from "@/lib/ask/ask";
import { askFacts } from "@/lib/ask/facts";
import { computeMetrics } from "@/lib/metrics/compute";
import { SYSTEM_PROMPT } from "@/lib/policy/classify";
import { CLASSIFIABLE, clauseById } from "@/lib/policy/clauses";
import { AS_OF, daysAgo, sale, steady } from "@/test/seed";
import { parseCsv } from "./csv";
import { loadEvalProducts } from "./policy";

// Held-out sets (Batch 5). Written after the prompts were frozen and committed before any run.
// These tests check the files are well formed and independent of the prompts; they never call a model.

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const joined = (s: string) => ` ${words(s).join(" ")} `;
const trigrams = (s: string) => {
  const w = words(s);
  const out: string[] = [];
  for (let i = 0; i + 3 <= w.length; i++) out.push(` ${w.slice(i, i + 3).join(" ")} `);
  return out;
};

describe("data/heldout_products.csv", () => {
  const products = loadEvalProducts("data/heldout_products.csv");
  const tuned = loadEvalProducts();

  it("has 20 products: 5 allowed, 6 pre-approval, 4 prohibited, 5 tricky, with IDs unused by the tuned set", () => {
    const count = (g: string) => products.filter((p) => p.group === g).length;
    expect([products.length, count("allowed"), count("preapproval"), count("prohibited"), count("tricky")]).toEqual([20, 5, 6, 4, 5]);
    expect(new Set(products.map((p) => p.id)).size).toBe(20);
    expect(products.filter((p) => tuned.some((t) => t.id === p.id))).toEqual([]);
  });

  it("labels are consistent with the clause file", () => {
    for (const p of products) {
      if (p.expectedVerdict === "allowed") expect(p.expectedClauseIds, p.id).toEqual([]);
      else expect(p.expectedClauseIds.length, p.id).toBeGreaterThan(0);
      for (const id of p.expectedClauseIds) {
        const clause = clauseById(id);
        expect(clause, `${p.id} ${id}`).toBeDefined();
        expect(clause!.kind, `${p.id} ${id}`).toBe(p.expectedVerdict);
      }
      if (p.group !== "tricky") expect(p.expectedVerdict, p.id).toBe(p.group);
    }
  });

  it("the policy prompt reuses no held-out wording (no 3 consecutive words outside PayPal's clause text)", () => {
    const promptText = joined(SYSTEM_PROMPT);
    const clauseText = joined(CLASSIFIABLE.map((c) => `${c.lead_in ?? ""} ${c.name} ${c.text}`).join(" "));
    const leaks = products.flatMap((p) => trigrams(`${p.name} ${p.description}`).filter((t) => promptText.includes(t) && !clauseText.includes(t)).map((t) => `${p.id}:${t.trim()}`));
    expect(leaks).toEqual([]);
  });

  it("no held-out product copies a tuned product (fewer than 3 shared word runs)", () => {
    const tunedText = tuned.map((t) => joined(`${t.name} ${t.description}`));
    for (const p of products) {
      for (const t of tunedText) expect(trigrams(`${p.name} ${p.description}`).filter((g) => t.includes(g)).length, p.id).toBeLessThan(3);
    }
  });
});

describe("data/heldout_refusal.csv", () => {
  const rows = parseCsv(readFileSync("data/heldout_refusal.csv", "utf8"));
  const tuned = parseCsv(readFileSync("data/eval_refusal.csv", "utf8"));

  it("has 21 rows: 8 evasion, 8 normal, 5 injection, with known expected values", () => {
    const count = (g: string) => rows.filter((r) => r.group === g).length;
    expect([rows.length, count("evasion"), count("normal"), count("injection")]).toEqual([21, 8, 8, 5]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(21);
    for (const r of rows) expect(["refuse", "answer", "not_refuse", "no_false_claim"], r.id).toContain(r.expected);
    expect(rows.filter((r) => tuned.some((t) => t.id === r.id || t.question === r.question))).toEqual([]);
  });

  it("the Ask Standing prompt reuses no held-out wording", () => {
    const prompt = joined(ASK_SYSTEM_PROMPT);
    const leaks = rows.flatMap((r) => trigrams(r.question).filter((t) => prompt.includes(t)).map((t) => `${r.id}:${t.trim()}`));
    // The prompt-leak canary (HI02) is the prompt's own words on purpose; the question itself must not be.
    expect(leaks).toEqual([]);
  });

  it("every false-claim canary is absent from the simulated facts, so the leak check can see it", () => {
    const metrics = computeMetrics({
      asOf: AS_OF,
      sales: [...steady(28, 1, 2, 20), ...steady(0, 0, 8, 20), sale(30, 12, { kind: "digital", categories: ["patterns"] })],
      disputeCreatedAt: [daysAgo(10)],
      firstSaleAt: daysAgo(120),
    });
    const facts = askFacts({ metrics, alerts: evaluate(metrics).map((c) => ({ kind: c.kind, title: c.title, message: c.message })), evidence: [] });
    const all = facts.map((f) => f.text).join("\n").toLowerCase();
    for (const r of rows.filter((x) => x.canary)) for (const c of r.canary.split("|")) expect(all.includes(c.toLowerCase()), `${r.id} ${c}`).toBe(false);
  });
});
