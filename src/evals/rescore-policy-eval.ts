// npm run eval:rescore -- evals/out/policy-….json — re-check a stored run's raw answers with the current
// validator (no model calls) and print the table again. Only answers the validator had rejected can change.
import { readFileSync } from "node:fs";
import { type EvalResult, formatScore, score } from "@/lib/evals/policy";
import { validate } from "@/lib/policy/classify";

const file = process.argv[2];
if (!file) throw new Error("Usage: npm run eval:rescore -- <results.json>");
const { meta, results } = JSON.parse(readFileSync(file, "utf8")) as { meta: string; results: EvalResult[] };
let changed = 0;
const rescored = results.map((r) => {
  if (!r.got?.rejected) return r;
  const again = validate(r.got.rejected.answer, { name: r.got.provider as "gemini" | "groq", model: r.got.model });
  if (!again.rejected) changed++;
  return { ...r, got: again.rejected ? r.got : { ...again, errors: r.got.errors } };
});
console.log(formatScore(score(rescored), `${meta} · re-scored with the current validator (${changed} answers newly accepted)`));
