import { describe, expect, it } from "vitest";
import type { LlmProvider } from "@/lib/llm/providers";
import { clauseById } from "@/lib/policy/clauses";
import { type Classification, classifyProduct, type Verdict } from "@/lib/policy/classify";
import { parseCsv } from "./csv";
import { type EvalProduct, type EvalResult, formatScore, loadEvalProducts, score } from "./policy";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and newlines inside fields, and CRLF", () => {
    const rows = parseCsv('a,b,c\r\n1,"x, y","say ""hi"""\n2,"line1\nline2",\n');
    expect(rows).toEqual([
      { a: "1", b: "x, y", c: 'say "hi"' },
      { a: "2", b: "line1\nline2", c: "" },
    ]);
  });

  it("rejects ragged rows and unterminated quotes", () => {
    expect(() => parseCsv("a,b\n1\n")).toThrow(/row 2 has 1 fields/);
    expect(() => parseCsv('a\n"oops\n')).toThrow(/quoted field/);
  });
});

describe("data/eval_products.csv", () => {
  const products = loadEvalProducts();

  it("has 53 products: 15 allowed, 15 pre-approval, 10 prohibited, 13 tricky, with unique IDs", () => {
    const count = (g: string) => products.filter((p) => p.group === g).length;
    expect([products.length, count("allowed"), count("preapproval"), count("prohibited"), count("tricky")]).toEqual([53, 15, 15, 10, 13]);
    expect(new Set(products.map((p) => p.id)).size).toBe(53);
  });

  it("labels are consistent with the clause file", () => {
    for (const p of products) {
      if (p.expectedVerdict === "allowed") expect(p.expectedClauseIds, p.id).toEqual([]);
      if (p.expectedVerdict === "prohibited" || p.expectedVerdict === "preapproval") expect(p.expectedClauseIds.length, p.id).toBeGreaterThan(0);
      for (const id of p.expectedClauseIds) {
        const clause = clauseById(id);
        expect(clause, `${p.id} ${id}`).toBeDefined();
        if (p.expectedVerdict !== "unclear") expect(clause!.kind, `${p.id} ${id}`).toBe(p.expectedVerdict);
      }
      if (p.group !== "tricky") expect(p.expectedVerdict, p.id).toBe(p.group);
    }
  });

  it("has the 31 Oct label decisions", () => {
    const byId = Object.fromEntries(products.map((p) => [p.id, [p.expectedVerdict, p.expectedClauseIds]]));
    expect(byId.T09).toEqual(["allowed", []]);
    expect(byId.T13).toEqual(["preapproval", ["PRE-16"]]);
    expect(byId.X02).toEqual(["prohibited", ["PROH-2a", "PROH-2b"]]);
    expect(byId.X06).toEqual(["prohibited", ["PROH-2j", "PROH-2k"]]);
    expect(byId.P14).toEqual(["preapproval", ["PRE-15"]]);
    expect(byId.T07).toEqual(["preapproval", ["PRE-07"]]);
  });
});

const product = (id: string, expectedVerdict: Verdict, expectedClauseId: string | string[] | null, group = expectedVerdict as EvalProduct["group"]): EvalProduct => ({
  id,
  group,
  name: id,
  description: "",
  expectedVerdict,
  expectedClauseIds: expectedClauseId === null ? [] : ([] as string[]).concat(expectedClauseId),
  note: "",
});
const got = (verdict: Verdict, clauseId: string | null = null, extra: Partial<Classification> = {}): Classification => ({
  verdict,
  clauseId,
  clauseName: null,
  quote: null,
  confidence: 0.9,
  reason: "r",
  provider: "gemini",
  model: "m",
  ...extra,
});

describe("score", () => {
  const results: EvalResult[] = [
    { product: product("A1", "allowed", null), got: got("allowed") },
    { product: product("A2", "allowed", null), got: got("unclear", "PRE-03") }, // false flag
    { product: product("P1", "preapproval", "PRE-15"), got: got("preapproval", "PRE-15") },
    { product: product("P2", "preapproval", "PRE-14"), got: got("unclear") }, // caught, wrong verdict
    { product: product("X1", "prohibited", "PROH-2c"), got: got("prohibited", "PROH-2h") }, // right verdict, wrong clause
    { product: product("X3", "prohibited", ["PROH-2j", "PROH-2k"]), got: got("prohibited", "PROH-2k") }, // either clause is right
    { product: product("X2", "prohibited", "PROH-2j"), got: got("allowed") }, // missed
    { product: product("T1", "prohibited", "PROH-2c", "tricky"), got: null, error: "All LLM providers failed" },
    { product: product("T2", "allowed", null, "tricky"), got: got("unclear", null, { rejected: { answer: {} as never, problem: "quote isn't in PRE-15" } }) },
  ];
  const s = score(results);

  it("counts per group and overall", () => {
    const byLabel = Object.fromEntries(s.rows.map((r) => [r.label, r]));
    expect(byLabel.allowed).toMatchObject({ n: 2, verdictCorrect: 1, flagged: 1 });
    expect(byLabel.preapproval).toMatchObject({ n: 2, verdictCorrect: 1, clauseCorrect: 1, clauseExpected: 2, flagged: 2 });
    expect(byLabel.prohibited).toMatchObject({ n: 3, verdictCorrect: 2, clauseCorrect: 1, clauseExpected: 3, flagged: 2 });
    expect(byLabel.all).toMatchObject({ n: 9, verdictCorrect: 4 });
  });

  it("catch rate counts any flag (incl. unclear) on products that must be caught; errors are not caught", () => {
    expect(s.catchRate).toEqual({ caught: 4, of: 6 });
    expect(s.falseFlags).toEqual({ flagged: 2, of: 3 });
    expect([s.downgraded, s.failed]).toEqual([1, 1]);
    expect(s.confusion.prohibited).toMatchObject({ prohibited: 2, allowed: 1, error: 1 });
  });

  it("lists misses, including right-verdict-wrong-clause", () => {
    expect(s.misses.map((m) => m.id)).toEqual(["A2", "P2", "X1", "X2", "T1", "T2"]);
    expect(s.misses.find((m) => m.id === "T2")!.reason).toBe("failed validation: quote isn't in PRE-15");
  });

  it("formats a table with the target verdict", () => {
    const out = formatScore(s, "meta");
    expect(out).toContain("| all | 9 | 4/9 (44%) |");
    expect(out).toContain("Caught (prohibited + pre-approval flagged for review): 4/6 (67%), target ≥90%: NOT MET");
  });
});

it("end to end with an oracle provider that answers the labels: 100%", async () => {
  const products = loadEvalProducts();
  const oracle: LlmProvider = {
    name: "gemini",
    model: "oracle",
    async generateJson(req) {
      const p = products.find((x) => req.user.includes(JSON.stringify(x.name)))!;
      const clause = p.expectedClauseIds.length ? clauseById(p.expectedClauseIds[0])! : null;
      return { verdict: p.expectedVerdict, clause_id: clause?.id ?? "", quote: clause ? clause.text.split(" ").slice(-3).join(" ") : "", confidence: 1, reason: "oracle" };
    },
  };
  const results: EvalResult[] = [];
  for (const product of products) results.push({ product, got: await classifyProduct(product, [oracle]) });
  const s = score(results);
  expect(s.rows.at(-1)).toMatchObject({ n: 53, verdictCorrect: 53 });
  expect(s.catchRate.caught).toBe(s.catchRate.of);
  expect(s.downgraded).toBe(0);
});
