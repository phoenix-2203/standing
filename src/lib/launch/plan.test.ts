import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { alerts, evidenceItems, launchPlans, packs, policyVerdicts } from "@/db/schema";
import { applyAlerts } from "@/lib/alerts/engine";
import { type JsonRequest, LlmError, type LlmProvider } from "@/lib/llm/providers";
import { computeMetrics } from "@/lib/metrics/compute";
import { testDb } from "@/test/helpers";
import { AS_OF, daysAgo, steady } from "@/test/seed";
import { activePlan, createLaunchPlan, InvalidLaunchPlan, planContext, planPackStatus, refreshLaunchPack } from "./plan";

const SELLER = "seller-1";
const LAUNCH = AS_OF.toISOString().slice(0, 10); // 2026-11-03
const BEFORE = new Date("2026-11-01T09:00:00Z");
const CANDLE = { name: "Lavender soy candle" };

// A model that answers policy checks and pack plans.
function model(opts: { verdict?: object; plan?: "good" | "forged"; fail?: boolean } = {}) {
  const seen: JsonRequest[] = [];
  const p: LlmProvider & { seen: JsonRequest[] } = {
    name: "groq",
    model: "openai/gpt-oss-120b",
    seen,
    async generateJson(req) {
      seen.push(req);
      if (opts.fail) throw new LlmError("groq", "HTTP 503");
      if (req.schemaName === "policy_check") return opts.verdict ?? { verdict: "allowed", clause_id: "", quote: "", confidence: 0.95, reason: "A candle." };
      const ids = (JSON.parse(req.user.split("\n")[1]) as { id: string }[]).map((f) => f.id);
      return { paragraphs: [{ items: [{ kind: "fact", fact_id: opts.plan === "forged" ? "EV-FORGED" : ids[0], text: "" }] }] };
    },
  };
  return p;
}
// 28 days of $40/day; `todayOrders` × $20 in the last 24 h. 6 orders = 3×, 12 = 6×, 16 = 8×.
const metricsAt = (todayOrders: number) => computeMetrics({ asOf: AS_OF, sales: [...steady(28, 1, 2, 20), ...steady(0, 0, todayOrders, 20)], disputeCreatedAt: [], firstSaleAt: daysAgo(120) });
const plan = (over: object = {}, m = model()) => createLaunchPlan(db, SELLER, { launchDate: LAUNCH, expectedMultiple: 6, products: [CANDLE], ...over }, [m], BEFORE);
const fired = async (todayOrders: number, now = AS_OF) => (await applyAlerts(db, SELLER, metricsAt(todayOrders), now)).fired.filter((a) => a.kind.includes("spike"));

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  for (const t of [alerts, launchPlans, packs, evidenceItems, policyVerdicts]) await db.delete(t);
});
afterEach(() => vi.restoreAllMocks());

describe("spike vs launch plan", () => {
  it("planned spike → 'expected spike: pack ready', calm, linking the pack", async () => {
    const p = await plan();
    const [a] = await fired(12); // 6×, exactly the plan
    expect(a).toMatchObject({ kind: "expected_spike", severity: "info", title: "Expected spike: pack ready", link: `/api/packs/${p.packId}/pdf` });
    expect(a.message).toContain("are 6.0× your average day");
    expect(a.message).toContain("within the 6× you planned for your launch on 2026-11-03");
    expect(a.message).toContain("your explanation pack is ready");
  });

  it("unplanned spike → the normal warning", async () => {
    const [a] = await fired(12);
    expect(a).toMatchObject({ kind: "spike", severity: "warning", title: "Sales spike" });
    expect(a.message).not.toContain("planned");
  });

  it("spike larger than planned → still warns, and says by how much", async () => {
    await plan();
    const [a] = await fired(16); // 8× vs 6× planned
    expect(a).toMatchObject({ kind: "spike", severity: "warning", title: "Sales spike above your launch plan" });
    expect(a.message).toContain("are 8.0× your average day");
    expect(a.message).toContain("more than the 6× you planned");
  });

  it("just over the plan warns: the raw ratio is compared, not the rounded one", async () => {
    await plan({ expectedMultiple: 3 });
    const m = computeMetrics({ asOf: AS_OF, sales: [...steady(28, 1, 2, 20), ...steady(0, 0, 6, 20), ...steady(0, 0, 1, 0.5)], disputeCreatedAt: [], firstSaleAt: daysAgo(120) });
    expect((await applyAlerts(db, SELLER, m, AS_OF)).fired.find((a) => a.kind.includes("spike"))).toMatchObject({ kind: "spike", severity: "warning" });
  });

  it("outside the window (before launch, or 3+ days after) → the normal warning", async () => {
    await plan({ launchDate: "2026-11-10" });
    expect((await fired(12))[0]).toMatchObject({ kind: "spike", title: "Sales spike" });
    await db.delete(alerts);
    await db.delete(launchPlans);
    await db.insert(launchPlans).values({ sellerId: SELLER, launchDate: "2026-10-31", expectedMultiple: "6.00", products: [], policy: [] });
    expect((await fired(12))[0]).toMatchObject({ kind: "spike", title: "Sales spike" });
  });

  it("the window covers the launch date and the 2 days after", async () => {
    await plan();
    for (const [at, active] of [["2026-11-02T23:59:00Z", false], ["2026-11-03T00:00:00Z", true], ["2026-11-05T23:59:00Z", true], ["2026-11-06T00:00:00Z", false]] as const) {
      expect(!!(await activePlan(db, SELLER, new Date(at))), at).toBe(active);
    }
  });

  it("no spike at all → no spike alert, plan or not", async () => {
    await plan();
    expect(await fired(2)).toEqual([]);
  });

  it("a blocked pack is never called ready: warns 'pack not ready'", async () => {
    await plan({}, model({ plan: "forged" }));
    expect(await planContext(db, SELLER, AS_OF)).toMatchObject({ packId: null });
    expect((await fired(12))[0]).toMatchObject({ kind: "expected_spike", severity: "warning", title: "Expected spike: pack not ready" });
  });

  it("a plan with a flagged product stays a warning and names it", async () => {
    const m = model({ verdict: { verdict: "preapproval", clause_id: "PRE-15", quote: "cigars", confidence: 0.9, reason: "Cigars." } });
    await plan({ products: [{ name: "Premium cigar sampler" }] }, m);
    const [a] = await fired(12);
    expect(a).toMatchObject({ kind: "spike", severity: "warning", title: "Sales spike" });
    expect(a.message).toContain("need attention first: Premium cigar sampler");
  });

  it("the alert moves from warning to expected when the plan is added", async () => {
    await fired(12);
    await plan();
    const run = await applyAlerts(db, SELLER, metricsAt(12), AS_OF);
    expect(run.resolved.map((a) => a.kind)).toContain("spike");
    expect(run.fired.map((a) => a.kind)).toContain("expected_spike");
  });
});

describe("createLaunchPlan", () => {
  it("policy-checks every product before anything else, and pre-builds the pack", async () => {
    const m = model();
    const p = await plan({ products: [CANDLE, { name: "Wick trimmer" }] }, m);
    expect(m.seen.map((r) => r.schemaName)).toEqual(["policy_check", "policy_check", "letter_plan"]);
    expect(p.policy.map((x) => [x.name, x.verdict])).toEqual([["Lavender soy candle", "allowed"], ["Wick trimmer", "allowed"]]);
    expect(p).toMatchObject({ launchDate: LAUNCH, expectedMultiple: "6.00", packBuiltAt: BEFORE });
    expect(p.packId).toBeTruthy();
  });

  it("reuses cached verdicts: an unchanged product isn't re-checked", async () => {
    await plan();
    const m = model();
    await plan({}, m);
    expect(m.seen.map((r) => r.schemaName)).toEqual(["letter_plan"]);
  });

  it("keeps the plan if the pack can't be built, with no pack yet", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await plan();
    await db.delete(launchPlans);
    await db.delete(packs);
    const failing: LlmProvider = { ...model(), async generateJson(req) { if (req.schemaName === "letter_plan") throw new LlmError("groq", "HTTP 503"); return { verdict: "allowed", clause_id: "", quote: "", confidence: 1, reason: "x" }; } };
    expect(await plan({}, failing as never)).toMatchObject({ packId: null, packBuiltAt: null });
  });

  it("reports a blocked pre-built pack as blocked, never as built (seen on the hosted app, 7 Nov)", async () => {
    const good = await plan();
    expect(await planPackStatus(db, good.packId)).toBe("ready");
    const blocked = await plan({}, model({ plan: "forged" }));
    expect(blocked.packId).toBeTruthy(); // a pack row exists…
    expect(await planPackStatus(db, blocked.packId)).toBe("blocked"); // …but it isn't ready
    expect(await planPackStatus(db, null)).toBe("none");
  });

  it("stores nothing when the policy check can't run", async () => {
    await expect(plan({}, model({ fail: true }))).rejects.toThrow(/All LLM providers failed/);
    expect(await db.select().from(launchPlans)).toHaveLength(0);
  });

  it.each([
    [{ launchDate: "next friday" }, /YYYY-MM-DD/],
    [{ launchDate: "2026-10-31" }, /past/],
    [{ expectedMultiple: 1 }, /above 1/],
    [{ expectedMultiple: Number.NaN }, /above 1/],
    [{ expectedMultiple: "6" }, /above 1/],
    [{ products: [] }, /at least one product/],
    [{ products: [{ name: " " }] }, /needs a name/],
  ])("rejects %j", async (bad, msg) => {
    const err = await plan(bad).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidLaunchPlan);
    expect((err as Error).message).toMatch(msg);
  });
});

describe("refreshLaunchPack", () => {
  it("rebuilds once when the window opens, not before and not again", async () => {
    const first = await plan();
    const m = model();
    await refreshLaunchPack(db, SELLER, [m], new Date("2026-11-02T12:00:00Z")); // before the window
    expect(m.seen).toHaveLength(0);
    await refreshLaunchPack(db, SELLER, [m], AS_OF);
    expect(m.seen.map((r) => r.schemaName)).toEqual(["letter_plan"]);
    const after = await activePlan(db, SELLER, AS_OF);
    expect(after!.packId).not.toBe(first.packId);
    await refreshLaunchPack(db, SELLER, [m], new Date(AS_OF.getTime() + 3600_000));
    expect(m.seen).toHaveLength(1);
  });
});
