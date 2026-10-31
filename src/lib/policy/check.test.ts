import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { policyVerdicts } from "@/db/schema";
import { LlmError, type LlmProvider } from "@/lib/llm/providers";
import { testDb } from "@/test/helpers";
import { checkProduct, productKey } from "./check";

const answering = (answer: unknown) => {
  let calls = 0;
  const p: LlmProvider & { calls: () => number } = {
    name: "groq",
    model: "openai/gpt-oss-120b",
    calls: () => calls,
    async generateJson() {
      calls++;
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return p;
};
const CIGARS = { verdict: "preapproval", clause_id: "PRE-15", quote: "cigars", confidence: 0.95, reason: "Cigars need pre-approval." };
const product = { name: "Premium cigars box", description: "Box of 10 hand-rolled Dominican cigars.", category: "tobacco" };

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  await db.delete(policyVerdicts);
});

describe("checkProduct", () => {
  it("classifies once, then answers from the cache while the text is unchanged", async () => {
    const llm = answering(CIGARS);
    const first = await checkProduct(db, "s1", product, [llm]);
    expect(first).toMatchObject({ cached: false, verdict: { verdict: "preapproval", clauseId: "PRE-15" } });
    const again = await checkProduct(db, "s1", { ...product, description: "  Box of 10   hand-rolled Dominican cigars. " }, [llm]);
    expect(again).toMatchObject({ cached: true, verdict: { verdict: "preapproval", clauseId: "PRE-15" } });
    expect(llm.calls()).toBe(1);
    const [row] = await db.select().from(policyVerdicts);
    expect(row).toMatchObject({ sellerId: "s1", policyLastUpdated: "2022-10-29", product: { description: "Box of 10 hand-rolled Dominican cigars." } });
  });

  it.each([
    [{ name: "Premium cigars box (gift)" }],
    [{ description: "Box of 20 hand-rolled Dominican cigars." }],
    [{ category: "gifts" }],
    [{ name: "premium cigars box" }], // case counts as a change
  ])("re-checks when the text changes: %j", async (change) => {
    const llm = answering(CIGARS);
    await checkProduct(db, "s1", product, [llm]);
    expect((await checkProduct(db, "s1", { ...product, ...change }, [llm])).cached).toBe(false);
    expect(llm.calls()).toBe(2);
  });

  it("keeps sellers' caches apart", async () => {
    const llm = answering(CIGARS);
    await checkProduct(db, "s1", product, [llm]);
    expect((await checkProduct(db, "s2", product, [llm])).cached).toBe(false);
  });

  it("never caches a failed check", async () => {
    await expect(checkProduct(db, "s1", product, [answering(new LlmError("groq", "HTTP 429"))])).rejects.toThrow(/All LLM providers failed/);
    expect(await db.select().from(policyVerdicts)).toHaveLength(0);
  });

  it("keys on the product text, not on object shape", () => {
    expect(productKey({ name: "A", description: undefined })).toBe(productKey({ name: " A ", description: "", category: "" }));
    expect(productKey({ name: "A", description: "B" })).not.toBe(productKey({ name: "A B" }));
  });
});
