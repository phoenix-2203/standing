import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { policyVerdicts } from "@/db/schema";
import type { LlmProvider } from "@/lib/llm/providers";
import { POLICY_SOURCE } from "./clauses";
import { type Classification, classifyProduct, type ProductInput } from "./classify";

const norm = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Same text → same key. Case and punctuation count as a change; whitespace doesn't. */
export function productKey(p: ProductInput): string {
  return createHash("sha256")
    .update(JSON.stringify([norm(p.name), norm(p.description), norm(p.category)]))
    .digest("hex");
}

/** Policy-check a product, reusing the stored verdict unless the product's text changed. */
export async function checkProduct(db: Db, sellerId: string, product: ProductInput, providers: LlmProvider[]): Promise<{ verdict: Classification; cached: boolean }> {
  const key = productKey(product);
  const [hit] = await db.select().from(policyVerdicts).where(and(eq(policyVerdicts.sellerId, sellerId), eq(policyVerdicts.productKey, key)));
  if (hit) return { verdict: hit.verdict as Classification, cached: true };

  const verdict = await classifyProduct(product, providers); // throws when no provider answers: nothing cached
  await db
    .insert(policyVerdicts)
    .values({
      sellerId,
      productKey: key,
      product: { name: norm(product.name), description: norm(product.description), category: norm(product.category) },
      verdict,
      policyLastUpdated: POLICY_SOURCE.lastUpdated,
    })
    .onConflictDoNothing();
  return { verdict, cached: false };
}
