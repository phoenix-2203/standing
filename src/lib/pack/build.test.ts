import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { disputes, evidenceItems, packs, shipments, transactionItems, transactions } from "@/db/schema";
import { addTrafficSource, syncLedger } from "@/lib/evidence/ledger";
import { type JsonRequest, LlmError, type LlmProvider } from "@/lib/llm/providers";
import { upsertTransaction } from "@/lib/sync/transactions";
import { testDb } from "@/test/helpers";
import { buildPack, PLAN_SCHEMA, PLAN_SYSTEM_PROMPT, salesCurve } from "./build";

const SELLER = "seller-1";
const NOW = new Date("2026-11-06T12:00:00Z");
const sale = (id: string, at: string, value: string) =>
  upsertTransaction(db, SELLER, {
    transaction_info: { transaction_id: id, transaction_event_code: "T0006", transaction_status: "S", transaction_initiation_date: at, transaction_amount: { currency_code: "USD", value } },
  });

/** A fake model that answers each call with the next plan (a function gets the fact IDs it was offered). */
type PlanFn = (factIds: string[]) => unknown;
const planner = (plans: (PlanFn | Error)[], name: "gemini" | "groq" = "gemini") => {
  const seen: JsonRequest[] = [];
  const p: LlmProvider & { seen: JsonRequest[] } = {
    name,
    model: `${name}-test`,
    seen,
    async generateJson(req) {
      seen.push(req);
      const next = plans[Math.min(seen.length - 1, plans.length - 1)];
      if (next instanceof Error) throw next;
      const ids = (JSON.parse(req.user.split("\n")[1]) as { id: string }[]).map((f) => f.id);
      return next(ids);
    },
  };
  return p;
};
const fact = (fact_id: string) => ({ kind: "fact", fact_id, text: "" });
const bridge = (text: string) => ({ kind: "bridge", fact_id: "", text });
const goodPlan: PlanFn = (ids) => ({
  paragraphs: [
    { items: [bridge("This letter explains recent activity on our account."), ...ids.filter((i) => i.includes("#")).map(fact)] },
    { items: [bridge("The supporting details are listed below."), ...ids.filter((i) => !i.includes("#")).slice(0, 3).map(fact)] },
    { items: [bridge("Thank you for your time and consideration.")] },
  ],
});
const forgedPlan: PlanFn = (ids) => ({ paragraphs: [{ items: [fact(ids[0]), fact("EV-TXN-FORGED00000000")] }] });

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  for (const t of [packs, evidenceItems, shipments, transactionItems, transactions, disputes]) await db.delete(t);
  await sale("1GB72668J97404239", "2026-11-04T10:00:00Z", "18.00");
  await sale("7X271304DH7155231", "2026-11-04T11:00:00Z", "20.00");
  await sale("OLD", "2026-08-01T10:00:00Z", "50.00"); // outside the 60 days
  await db.insert(shipments).values({ sellerId: SELLER, transactionId: "1GB72668J97404239", trackerId: "T1", trackingNumber: "STANDINGD1PHY01", carrier: "USPS", status: "SHIPPED", source: "paypal_read", createdAt: new Date("2026-11-04T12:00:00Z") });
  await db.insert(disputes).values({ disputeId: "PP-D-1", sellerId: SELLER, createdAtPaypal: new Date("2026-11-05T00:00:00Z"), status: "OPEN", sellerTransactionIds: [], raw: {} });
  await syncLedger(db, SELLER);
  await addTrafficSource(db, SELLER, { label: "TikTok video", url: "https://www.tiktok.com/@maker/video/1", date: "2026-11-03", simulated: true });
});

describe("salesCurve", () => {
  it("zero-fills every UTC day of the period and sums payments per day in cents", async () => {
    await sale("A", "2026-11-05T09:00:00Z", "18.10");
    await sale("LATE", "2026-11-06T13:00:00Z", "99.00"); // after NOW
    const curve = await salesCurve(db, SELLER, new Date("2026-11-03T12:00:00Z"), NOW);
    expect(curve).toEqual([
      { day: "2026-11-03", cents: 0, orders: 0 },
      { day: "2026-11-04", cents: 3800, orders: 2 },
      { day: "2026-11-05", cents: 1810, orders: 1 },
      { day: "2026-11-06", cents: 0, orders: 0 },
    ]);
  });
});

describe("buildPack", () => {
  it("offers code-rendered facts, and renders a valid plan into a ready letter", async () => {
    const w = planner([goodPlan]);
    const pack = await buildPack(db, SELLER, [w], { now: NOW });

    expect(pack).toMatchObject({ status: "ready", attempts: 1, provider: "gemini", validation: { ok: true, problems: [] } });
    expect(w.seen[0]).toMatchObject({ system: PLAN_SYSTEM_PROMPT, schema: PLAN_SCHEMA, schemaName: "letter_plan" });
    const offered = JSON.parse(w.seen[0].user.split("\n")[1]) as { id: string; text: string; simulated: boolean }[];
    expect(offered.slice(0, 5).map((f) => f.text)).toEqual([
      "PayPal payments received between 2026-09-07 and 2026-11-06: 2, totalling USD 38.00.",
      "Busiest day: 2026-11-04, with 2 of those payments, totalling USD 38.00.",
      "Payments with tracking in PayPal: 1 of 2.",
      "Payments marked Completed in PayPal: 0 of 2.",
      "Disputes opened in the period: 1.",
    ]);
    expect(offered[5]).toMatchObject({ simulated: true, text: expect.stringMatching(/^Simulated: Traffic source/) });
    expect(offered.map((f) => f.id)).not.toContain("EV-TXN-OLD");

    const sentences = pack.letter!.paragraphs.flatMap((p) => p.sentences);
    expect(sentences[0]).toEqual({ kind: "bridge", text: "This letter explains recent activity on our account.", citations: [] });
    expect(sentences[1]).toEqual({ kind: "fact", text: offered[0].text, citations: [pack.summaryEvidenceId] });
    // Every fact sentence in the letter is exactly a code-rendered fact.
    const factTexts = new Set(pack.facts!.map((f) => f.text));
    expect(sentences.filter((s) => s.kind === "fact").every((s) => factTexts.has(s.text))).toBe(true);
  });

  it("a pack with a forged citation is blocked: no letter, the problem recorded", async () => {
    const w = planner([forgedPlan]);
    const pack = await buildPack(db, SELLER, [w], { now: NOW });
    expect(pack).toMatchObject({ status: "blocked", letter: null, attempts: 2 });
    expect(pack.validation!.problems[0].problem).toBe('unknown fact ID "EV-TXN-FORGED00000000"');
    expect(w.seen).toHaveLength(2);
  });

  it("gives the model one rewrite with the problems, and passes it if the rewrite is clean", async () => {
    const claimy: PlanFn = (ids) => ({ paragraphs: [{ items: [bridge("Sales doubled after our video went viral."), fact(ids[0])] }] });
    const w = planner([claimy, goodPlan]);
    const pack = await buildPack(db, SELLER, [w], { now: NOW });
    expect(pack).toMatchObject({ status: "ready", attempts: 2 });
    expect(w.seen[1].user).toContain("Your previous plan was rejected");
    expect(w.seen[1].user).toContain('number or quantity word ("doubled")');
  });

  it("stays blocked if the rewrite is still bad", async () => {
    const claimy: PlanFn = (ids) => ({ paragraphs: [{ items: [bridge("PayPal will release the funds."), fact(ids[0])] }] });
    const pack = await buildPack(db, SELLER, [planner([claimy])], { now: NOW });
    expect(pack).toMatchObject({ status: "blocked", letter: null, attempts: 2 });
  });

  it("after the retries, leaves out a harmless linking phrase rather than block the pack, and records it", async () => {
    const stray: PlanFn = (ids) => ({ paragraphs: [{ items: [fact(ids[0]), bridge("Additional information follows.")] }] });
    const pack = await buildPack(db, SELLER, [planner([stray])], { now: NOW });
    expect(pack).toMatchObject({ status: "ready", attempts: 2 });
    expect(JSON.stringify(pack.letter)).not.toContain("Additional information follows.");
    expect(pack.validation!.dropped!.map((d) => d.text)).toEqual(["Additional information follows."]);
  });

  it("falls back to the next provider, and fails clearly when none can plan", async () => {
    const pack = await buildPack(db, SELLER, [planner([new LlmError("gemini", "HTTP 429")]), planner([goodPlan], "groq")], { now: NOW });
    expect(pack).toMatchObject({ provider: "groq", status: "ready" });
    await expect(buildPack(db, SELLER, [planner([new LlmError("gemini", "down")])], { now: NOW })).rejects.toThrow(/Couldn't plan the cover letter: gemini: down/);
  });
});

describe("buildPack provider retries", () => {
  it("retries the same provider once after a strict-JSON fluke, but not after other errors", async () => {
    const fluke = planner([new LlmError("groq", "HTTP 400: Failed to validate JSON. Please adjust your prompt."), goodPlan], "groq");
    expect((await buildPack(db, SELLER, [fluke], { now: NOW })).status).toBe("ready");
    expect(fluke.seen).toHaveLength(2);

    const quota = planner([new LlmError("gemini", "HTTP 429: quota"), goodPlan]);
    await expect(buildPack(db, SELLER, [quota], { now: NOW })).rejects.toThrow(/429/);
    expect(quota.seen).toHaveLength(1);
  });

  it("offers at most 25 facts' worth of evidence", async () => {
    for (let i = 0; i < 40; i++) await sale(`BULK${String(i).padStart(2, "0")}`, "2026-11-05T10:00:00Z", "5.00");
    await syncLedger(db, SELLER);
    const w = planner([goodPlan]);
    const pack = await buildPack(db, SELLER, [w], { now: NOW });
    expect(pack.evidence).toHaveLength(25);
  });
});
