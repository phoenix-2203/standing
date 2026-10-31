import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { syncState } from "@/db/schema";

export type SyncJob = "transactions" | "disputes" | "trackers";

export interface SyncReport {
  job: SyncJob;
  ok: boolean;
  upserted: number;
  requests: number;
  syncedThrough: Date | null;
  error?: string;
  debugId?: string | null;
}

export async function getSyncedThrough(db: Db, sellerId: string, job: SyncJob): Promise<Date | null> {
  const [row] = await db
    .select()
    .from(syncState)
    .where(and(eq(syncState.sellerId, sellerId), eq(syncState.job, job)));
  return row?.syncedThrough ?? null;
}

/** Record a run. On failure the cursor is left where it was so the next run retries the same range. */
export async function recordRun(db: Db, sellerId: string, report: SyncReport, now: Date): Promise<void> {
  const values = {
    lastRunAt: now,
    lastError: report.error ?? null,
    lastDebugId: report.debugId ?? null,
    ...(report.ok ? { syncedThrough: report.syncedThrough } : {}),
  };
  await db
    .insert(syncState)
    .values({ sellerId, job: report.job, ...values })
    .onConflictDoUpdate({ target: [syncState.sellerId, syncState.job], set: values });
}

/** PayPal's date format for query strings: second precision, UTC. */
export function paypalDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Millisecond precision; the Disputes API requires it for its time filters. */
export function paypalDateMs(d: Date): string {
  return d.toISOString();
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
