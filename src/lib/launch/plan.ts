import { and, desc, eq, gt, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { launchPlans, packs } from "@/db/schema";
import type { PlanContext } from "@/lib/alerts/rules";
import type { LlmProvider } from "@/lib/llm/providers";
import { DAY } from "@/lib/metrics/compute";
import { buildPack } from "@/lib/pack/build";
import { checkProduct } from "@/lib/policy/check";

// Launch plan (BLUEPRINT §2 "should build"): the seller says when a spike is coming. Its products are
// policy-checked first and the explanation pack is pre-built. Standing's own default, not a PayPal rule:
// a plan covers the launch date and the 2 days after it.

export const LAUNCH_WINDOW_DAYS = 3;
const MAX_MULTIPLE = 1000;

export type LaunchPlan = typeof launchPlans.$inferSelect;

export interface LaunchPlanInput {
  launchDate: string; // YYYY-MM-DD
  expectedMultiple: number;
  products: { name: string; description?: string; category?: string }[];
}

export function validateLaunchPlan(input: LaunchPlanInput, now: Date): string | null {
  if (typeof input.launchDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.launchDate) || Number.isNaN(Date.parse(input.launchDate))) return "Launch date must be YYYY-MM-DD";
  if (input.launchDate < now.toISOString().slice(0, 10)) return "Launch date can't be in the past";
  if (typeof input.expectedMultiple !== "number" || !Number.isFinite(input.expectedMultiple) || input.expectedMultiple <= 1 || input.expectedMultiple > MAX_MULTIPLE) {
    return `Expected multiple must be a number above 1 and up to ${MAX_MULTIPLE}`;
  }
  if (!Array.isArray(input.products) || !input.products.length) return "A launch plan needs at least one product";
  if (input.products.some((p) => typeof p?.name !== "string" || !p.name.trim())) return "Every launch product needs a name";
  return null;
}

/** Policy-check the products, store the plan, pre-build the pack. A pack that can't be built is reported, not fatal. */
export async function createLaunchPlan(db: Db, sellerId: string, input: LaunchPlanInput, providers: LlmProvider[], now = new Date()): Promise<LaunchPlan> {
  const invalid = validateLaunchPlan(input, now);
  if (invalid) throw new InvalidLaunchPlan(invalid);

  const products = input.products.map((p) => ({ name: p.name.trim(), description: p.description?.trim() ?? "", category: p.category?.trim() ?? "" }));
  const policy = [];
  for (const product of products) {
    const { verdict } = await checkProduct(db, sellerId, product, providers);
    policy.push({ name: product.name, verdict: verdict.verdict, clauseId: verdict.clauseId, quote: verdict.quote, reason: verdict.reason });
  }
  const [plan] = await db
    .insert(launchPlans)
    .values({ sellerId, launchDate: input.launchDate, expectedMultiple: input.expectedMultiple.toFixed(2), products, policy, createdAt: now })
    .returning();
  return prebuildPack(db, plan, providers, now);
}

export class InvalidLaunchPlan extends Error {}

async function prebuildPack(db: Db, plan: LaunchPlan, providers: LlmProvider[], now: Date): Promise<LaunchPlan> {
  let pack;
  try {
    pack = await buildPack(db, plan.sellerId, providers, { now });
  } catch (err) {
    console.error(`Launch plan ${plan.id}: pack not built (${(err as Error).message.slice(0, 120)})`);
    return plan;
  }
  const [row] = await db.update(launchPlans).set({ packId: pack.id, packBuiltAt: now }).where(eq(launchPlans.id, plan.id)).returning();
  return row;
}

const windowStart = (plan: Pick<LaunchPlan, "launchDate">) => new Date(`${plan.launchDate}T00:00:00Z`);

/** The plan whose window includes `now`, if any. */
export async function activePlan(db: Db, sellerId: string, now: Date): Promise<LaunchPlan | null> {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [plan] = await db
    .select()
    .from(launchPlans)
    .where(and(eq(launchPlans.sellerId, sellerId), lte(launchPlans.launchDate, iso(now)), gt(launchPlans.launchDate, iso(new Date(now.getTime() - LAUNCH_WINDOW_DAYS * DAY)))))
    .orderBy(desc(launchPlans.createdAt))
    .limit(1);
  return plan ?? null;
}

/** Each cycle: once the launch window opens, rebuild the pack so it includes everything up to launch. */
export async function refreshLaunchPack(db: Db, sellerId: string, providers: LlmProvider[], now = new Date()): Promise<void> {
  const plan = await activePlan(db, sellerId, now);
  if (!plan || (plan.packBuiltAt && plan.packBuiltAt >= windowStart(plan))) return;
  await prebuildPack(db, plan, providers, now);
}

/** The state of a plan's pre-built pack, as stored: a blocked pack must never be shown as built. */
export type PlanPackStatus = "ready" | "blocked" | "none";
export async function planPackStatus(db: Db, packId: string | null): Promise<PlanPackStatus> {
  if (!packId) return "none";
  const [pack] = await db.select({ status: packs.status }).from(packs).where(eq(packs.id, packId));
  return pack?.status === "ready" ? "ready" : pack?.status === "blocked" ? "blocked" : "none";
}

/** What the alert rules need to know about the active plan. */
export async function planContext(db: Db, sellerId: string, now: Date): Promise<PlanContext | null> {
  const plan = await activePlan(db, sellerId, now);
  if (!plan) return null;
  const [pack] = plan.packId ? await db.select({ status: packs.status }).from(packs).where(eq(packs.id, plan.packId)) : [];
  return {
    launchDate: plan.launchDate,
    expectedMultiple: Number(plan.expectedMultiple),
    packId: pack?.status === "ready" ? plan.packId : null,
    flaggedProducts: plan.policy.filter((p) => p.verdict !== "allowed").map((p) => p.name),
  };
}
