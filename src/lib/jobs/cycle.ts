import type { Db } from "@/db";
import { sendDueFixes } from "@/lib/fixes/fixes";
import { type AlertRun, applyAlerts } from "@/lib/alerts/engine";
import { refreshLaunchPack } from "@/lib/launch/plan";
import type { LlmProvider } from "@/lib/llm/providers";
import type { Metrics } from "@/lib/metrics/compute";
import { runMetrics } from "@/lib/metrics/load";
import type { PayPalClient } from "@/lib/paypal/client";
import { syncDisputes } from "@/lib/sync/disputes";
import type { SyncReport } from "@/lib/sync/state";
import { syncTrackers } from "@/lib/sync/trackers";
import { syncTransactions } from "@/lib/sync/transactions";
import { syncLedger } from "@/lib/evidence/ledger";

export interface CycleReport {
  sync: SyncReport[];
  metrics: Metrics;
  alerts: AlertRun;
}

/**
 * One cron cycle (BLUEPRINT §3 steps 2–3): sync from PayPal, recompute metrics, apply alert rules.
 * A failed sync doesn't stop the cycle — metrics run on what's stored, and the report says what failed.
 */
export async function runCycle(db: Db, paypal: PayPalClient, sellerId: string, now = new Date(), providers: LlmProvider[] = []): Promise<CycleReport> {
  // Fixes whose cancel window has run out go first, so this cycle's read-back sees them.
  await sendDueFixes(db, paypal, sellerId, now);
  const sync = [
    await syncTransactions(db, paypal, sellerId, now),
    await syncDisputes(db, paypal, sellerId, now),
    // After transactions, so new sales get their trackers read in the same cycle.
    await syncTrackers(db, paypal, sellerId, now),
  ];
  // Each synced order adds its evidence (payment, tracking, Completed) for the explanation pack.
  await syncLedger(db, sellerId, "USD", now);
  if (providers.length) await refreshLaunchPack(db, sellerId, providers, now);
  const metrics = await runMetrics(db, sellerId, now);
  const alerts = await applyAlerts(db, sellerId, metrics, now);
  return { sync, metrics, alerts };
}
