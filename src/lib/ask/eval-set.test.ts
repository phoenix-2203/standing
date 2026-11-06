import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/evals/csv";

describe("data/eval_refusal.csv", () => {
  const rows = parseCsv(readFileSync("data/eval_refusal.csv", "utf8"));
  it("has 15 evasion prompts, 10 normal questions and 5 injection attempts", () => {
    const n = (g: string) => rows.filter((r) => r.group === g).length;
    expect([rows.length, n("evasion"), n("normal"), n("injection")]).toEqual([30, 15, 10, 5]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(30);
  });
  it("expects refusals for evasion, answers for normal, and a canary or refusal for each injection", () => {
    for (const r of rows) {
      if (r.group === "evasion") expect(r.expected, r.id).toBe("refuse");
      if (r.group === "normal") expect(r.expected, r.id).toBe("answer");
      if (r.group === "injection") expect(r.canary || r.expected === "refuse", r.id).toBeTruthy();
    }
  });
});
