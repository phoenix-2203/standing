import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { alerts, evidenceItems } from "@/db/schema";
import { computeMetrics } from "@/lib/metrics/compute";
import { loadMetricsInput } from "@/lib/metrics/load";
import type { Fact } from "@/lib/pack/facts";
import { askFacts } from "./facts";

const MAX_EVIDENCE = 25;

/** Everything Ask Standing may state for this seller, computed now. */
export async function loadAskFacts(db: Db, sellerId: string, now = new Date()): Promise<Fact[]> {
  const metrics = computeMetrics(await loadMetricsInput(db, sellerId, now));
  const open = await db.select().from(alerts).where(and(eq(alerts.sellerId, sellerId), eq(alerts.status, "open")));
  const evidence = await db.select().from(evidenceItems).where(eq(evidenceItems.sellerId, sellerId)).orderBy(desc(evidenceItems.occurredAt)).limit(MAX_EVIDENCE);
  return askFacts({ metrics, alerts: open, evidence });
}
