// npm run eval:policy — classify every product in data/eval_products.csv with the configured LLM
// provider(s) and print the accuracy table. Results also go to evals/out/ (git-ignored).
import { mkdirSync, writeFileSync } from "node:fs";
import { providersFromEnv } from "@/lib/llm/providers";
import { type EvalResult, formatScore, loadEvalProducts, score } from "@/lib/evals/policy";
import { AllProvidersFailed, classifyProduct } from "@/lib/policy/classify";

// Stay under free-tier limits: Groq's 8,000 tokens/min allows ~3 of these ~2.6k-token requests a minute.
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 20_000);
const RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // EVAL_PROVIDER=gemini|groq runs one provider alone (no fallback), to compare models.
  const pick = process.env.EVAL_PROVIDER?.trim();
  const providers = providersFromEnv().filter((p) => !pick || p.name === pick);
  if (!providers.length) throw new Error(pick ? `Provider ${pick} isn't configured in .env` : "Set GEMINI_API_KEY (and optionally GROQ_API_KEY) in .env");
  const products = loadEvalProducts();
  const only = process.env.EVAL_ONLY?.split(",");
  const results: EvalResult[] = [];

  for (const product of only ? products.filter((p) => only.includes(p.id)) : products) {
    let result: EvalResult = { product, got: null };
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      try {
        result = { product, got: await classifyProduct(product, providers) };
        break;
      } catch (err) {
        // A bad key or request won't fix itself: stop the whole run instead of failing 50 times.
        if (!(err instanceof AllProvidersFailed) || !err.retryable) throw err;
        result = { product, got: null, error: err.message };
        // Rate limited or temporarily down: back off and retry the same product.
        if (attempt < RETRIES) await sleep(20_000 * attempt);
      }
    }
    results.push(result);
    process.stderr.write(`${product.id} ${result.got ? `${result.got.verdict} ${result.got.clauseId ?? ""}` : `ERROR ${result.error}`}\n`);
    await sleep(DELAY_MS);
  }

  const at = new Date().toISOString();
  const meta = `Policy eval ${at} · ${providers.map((p) => `${p.name}:${p.model}`).join(" → ")} · ${results.length} products`;
  console.log(formatScore(score(results), meta));
  mkdirSync("evals/out", { recursive: true });
  writeFileSync(`evals/out/policy-${at.replace(/[:.]/g, "-")}.json`, JSON.stringify({ meta, results }, null, 1));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
