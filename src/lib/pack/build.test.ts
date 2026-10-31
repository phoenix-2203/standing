import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { disputes, evidenceItems, packs, shipments, transactionItems, transactions } from "@/db/schema";
import { addTrafficSource, syncLedger } from "@/lib/evidence/ledger";
import { type JsonRequest, LlmError, type LlmProvider } from "@/lib/llm/providers";
import { upsertTransaction } from "@/lib/sync/transactions";
import { testDb } from "@/test/helpers";
import { buildPack, LETTER_SCHEMA, LETTER_SYSTEM_PROMPT, salesCurve } from "./build";

const SELLER = "seller-1";
const NOW = new Date("2026-11-06T12:00:00Z");
const sale = (id: string, at: string, value: string) =>
  upsertTransaction(db, SELLER, {
    transaction_info: { transaction_id: id, transaction_event_code: "T0006", transaction_status: "S", transaction_initiation_date: at, transaction_amount: { currency_code: "USD", value } },
  });
const writer = (letter: unknown, name: "gemini" | "groq" = "gemini") => {
  const seen: JsonRequest[] = [];
  const p: LlmProvider & { seen: JsonRequest[] } = { name, model: `${name}-test`, seen, async generateJson(req) { seen.push(req); if (letter instanceof Error) throw letter; return letter; } };
  return p;
};
const LETTER = { paragraphs: [{ sentences: [{ text: "Sales rose.", citations: ["EV-SUM"] }] }] };

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  for (const t of [packs, evidenceItems, shipments, transactionItems, transactions, disputes]) await db.delete(t);
});

describe("salesCurve", () => {
  it("zero-fills every UTC day of the period and sums payments per day in cents", async () => {
    await sale("A", "2026-11-04T09:00:00Z", "18.10");
    await sale("B", "2026-11-04T23:59:00Z", "20.00");
    await sale("C", "2026-11-06T11:00:00Z", "5.00");
    await sale("LATE", "2026-11-06T13:00:00Z", "99.00"); // after NOW
    const curve = await salesCurve(db, SELLER, new Date("2026-11-03T12:00:00Z"), NOW);
    expect(curve).toEqual([
      { day: "2026-11-03", cents: 0, orders: 0 },
      { day: "2026-11-04", cents: 3810, orders: 2 },
      { day: "2026-11-05", cents: 0, orders: 0 },
      { day: "2026-11-06", cents: 500, orders: 1 },
    ]);
  });
});

describe("buildPack", () => {
  it("computes the summary by code, offers it first with seller items, and sends evidence as JSON data", async () => {
    await sale("1GB72668J97404239", "2026-11-04T10:00:00Z", "18.00");
    await sale("7X271304DH7155231", "2026-11-04T11:00:00Z", "20.00");
    await sale("OLD", "2026-08-01T10:00:00Z", "50.00"); // outside the 60 days
    await db.insert(shipments).values({ sellerId: SELLER, transactionId: "1GB72668J97404239", trackerId: "T1", trackingNumber: "STANDINGD1PHY01", carrier: "USPS", status: "SHIPPED", source: "paypal_read" });
    await db.insert(disputes).values({ disputeId: "PP-D-1", sellerId: SELLER, createdAtPaypal: new Date("2026-11-05T00:00:00Z"), status: "OPEN", sellerTransactionIds: [], raw: {} });
    await syncLedger(db, SELLER);
    await addTrafficSource(db, SELLER, { label: "TikTok video", url: "https://www.tiktok.com/@maker/video/1", date: "2026-11-03", simulated: true });
    const w = writer(LETTER);

    const pack = await buildPack(db, SELLER, [w], { now: NOW });

    expect(pack).toMatchObject({ status: "draft", provider: "gemini", model: "gemini-test", letter: LETTER, validation: null });
    const ids = pack.evidence.map((e) => e.id);
    expect(ids[0]).toBe(pack.summaryEvidenceId);
    expect(ids[1]).toMatch(/^EV-SRC-/);
    expect(ids).toContain("EV-TRK-1GB72668J97404239-STANDINGD1PHY01");
    expect(ids).not.toContain("EV-TXN-OLD");
    expect(pack.evidence[0].summary).toBe(
      "Between 2026-09-07 and 2026-11-06 the seller received 2 PayPal payments totalling USD 38.00; the busiest day was 2026-11-04 with 2 payments totalling USD 38.00. " +
        "1 of these payments have tracking in PayPal, 0 are marked Completed, and 1 disputes were opened in the period.",
    );
    expect(pack.evidence.find((e) => e.id.startsWith("EV-SRC-"))).toMatchObject({ simulated: true });

    const req = w.seen[0];
    expect(req.system).toBe(LETTER_SYSTEM_PROMPT);
    expect(req.schema).toBe(LETTER_SCHEMA);
    expect(JSON.parse(req.user.split("\n").slice(1).join("\n"))[0]).toEqual({ id: pack.summaryEvidenceId, kind: "sales_summary", simulated: false, summary: pack.evidence[0].summary });
  });

  it("uses the validator's verdict for the status", async () => {
    await sale("A", "2026-11-04T10:00:00Z", "18.00");
    const ok = await buildPack(db, SELLER, [writer(LETTER)], { now: NOW, validate: () => ({ ok: true, problems: [] }) });
    const bad = await buildPack(db, SELLER, [writer(LETTER)], { now: NOW, validate: () => ({ ok: false, problems: [{ paragraph: 0, sentence: 0, text: "x", problem: "y" }] }) });
    expect([ok.status, bad.status]).toEqual(["ready", "blocked"]);
  });

  it("falls back to the next provider, and fails clearly when none can write", async () => {
    const pack = await buildPack(db, SELLER, [writer(new LlmError("gemini", "HTTP 429")), writer(LETTER, "groq")], { now: NOW });
    expect(pack.provider).toBe("groq");
    await expect(buildPack(db, SELLER, [writer(new LlmError("gemini", "down"))], { now: NOW })).rejects.toThrow(/Couldn't write the cover letter: gemini: down/);
  });
});
