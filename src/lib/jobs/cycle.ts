import type { Db } from "@/db";
import { type AlertRun, applyAlerts } from "@/lib/alerts/engine";
import type { Metrics } from "@/lib/metrics/compute";
import { runMetrics } from "@/lib/metrics/load";
import type { PayPalClient } from "@/lib/paypal/client";
import { syncDisputes } from "@/lib/sync/disputes";
import type { SyncReport } from "@/lib/sync/state";
import { syncTrackers } from "@/lib/sync/trackers";
import { syncTransactions } from "@/lib/sync/transactions";

export interface CycleReport {
  sync: SyncReport[];
  metrics: Metrics;
  alerts: AlertRun;
}

/**
 * One cron cycle (BLUEPRINT §3 steps 2–3): sync from PayPal, recompute metrics, apply alert rules.
 * A failed sync doesn't stop the cycle — metrics run on what's stored, and the report says what failed.
 */
export async function runCycle(db: Db, paypal: PayPalClient, sellerId: string, now = new Date()): Promise<CycleReport> {
  const sync = [
    await syncTransactions(db, paypal, sellerId, now),
    await syncDisputes(db, paypal, sellerId, now),
    // After transactions, so new sales get their trackers read in the same cycle.
    await syncTrackers(db, paypal, sellerId, now),
  ];
  const metrics = await runMetrics(db, sellerId, now);
  const alerts = await applyAlerts(db, sellerId, metrics, now);
  return { sync, metrics, alerts };
}
