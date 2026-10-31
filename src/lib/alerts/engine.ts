import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { alerts } from "@/db/schema";
import type { Metrics } from "@/lib/metrics/compute";
import { evaluate } from "./rules";

export type Alert = typeof alerts.$inferSelect;

export interface AlertRun {
  fired: Alert[]; // newly opened this run: these are what get sent to the seller
  ongoing: Alert[]; // still true, already open: updated, not re-sent
  resolved: Alert[];
}

export async function applyAlerts(db: Db, sellerId: string, metrics: Metrics, now = new Date()): Promise<AlertRun> {
  const conditions = evaluate(metrics);
  const open = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.sellerId, sellerId), eq(alerts.status, "open")));
  const openByKind = new Map(open.map((a) => [a.kind, a]));
  const run: AlertRun = { fired: [], ongoing: [], resolved: [] };

  for (const c of conditions) {
    const existing = openByKind.get(c.kind);
    if (existing) {
      const [row] = await db
        .update(alerts)
        .set({ title: c.title, message: c.message, facts: c.facts, lastSeenAt: now })
        .where(eq(alerts.id, existing.id))
        .returning();
      run.ongoing.push(row);
      continue;
    }
    // The partial unique index makes a concurrent run's duplicate a no-op.
    const [row] = await db
      .insert(alerts)
      .values({ sellerId, kind: c.kind, title: c.title, message: c.message, facts: c.facts, firstFiredAt: now, lastSeenAt: now })
      .onConflictDoNothing()
      .returning();
    if (row) run.fired.push(row);
  }

  const firing = new Set<string>(conditions.map((c) => c.kind));
  for (const a of open.filter((a) => !firing.has(a.kind))) {
    const [row] = await db.update(alerts).set({ status: "resolved", resolvedAt: now }).where(eq(alerts.id, a.id)).returning();
    run.resolved.push(row);
  }
  return run;
}
