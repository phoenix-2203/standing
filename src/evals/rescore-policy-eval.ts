// npm run eval:rescore -- evals/out/policy-….json — re-score a stored run with the current validator and
// the current labels in data/eval_products.csv (no model calls), and print the table again.
import { readFileSync } from "node:fs";
import { type EvalProduct, type EvalResult, formatScore, loadEvalProducts, score } from "@/lib/evals/policy";
import { validate } from "@/lib/policy/classify";

const file = process.argv[2];
if (!file) throw new Error("Usage: npm run eval:rescore -- <results.json>");
const { meta, results } = JSON.parse(readFileSync(file, "utf8")) as { meta: string; results: EvalResult[] };
const labels = new Map(loadEvalProducts().map((p) => [p.id, p]));
let changed = 0;
const rescored = results.map((stored) => {
  // Older runs stored one expected clause; the current labels replace them.
  const r = { ...stored, product: labels.get(stored.product.id) ?? (stored.product as EvalProduct) };
  if (!r.got?.rejected) return r;
  const again = validate(r.got.rejected.answer, { name: r.got.provider as "gemini" | "groq", model: r.got.model });
  if (!again.rejected) changed++;
  return { ...r, got: again.rejected ? r.got : { ...again, errors: r.got.errors } };
});
console.log(formatScore(score(rescored), `${meta} · re-scored with the current validator and labels (${changed} answers newly accepted)`));
