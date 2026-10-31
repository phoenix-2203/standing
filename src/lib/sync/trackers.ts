import { and, asc, desc, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { shipments, transactions } from "@/db/schema";
import { HISTORY_DAYS } from "@/lib/metrics/compute";
import { saleWhere } from "@/lib/metrics/load";
import { type PayPalClient, PayPalUnknownOutcome } from "@/lib/paypal/client";
import { DAY, HOUR, recordRun, type SyncReport } from "./state";

// Tracking read-back: what PayPal already knows about each sale's tracking, so coverage and the digital
// gap reflect real data (trackers the seller added elsewhere, or via Orders v2 /track), not only Standing's
// own pushes. Read-only: one GET /v1/shipping/trackers per sale.

export const TRACKER_RECHECK_MS = 6 * HOUR;
export const TRACKERS_PER_RUN = 50;

interface PayPalTracker {
  transaction_id: string;
  tracking_number?: string;
  status: string;
  carrier?: string;
  links?: { rel: string; href: string }[];
}

export async function syncTrackers(db: Db, paypal: PayPalClient, sellerId: string, now = new Date(), currency = "USD"): Promise<SyncReport> {
  const report: SyncReport = { job: "trackers", ok: true, upserted: 0, requests: 0, syncedThrough: now };

  // A sale is settled once it has a live tracking number or a COMPLETED tracker; stop asking about it.
  const settled = sql`exists (
    select 1 from ${shipments}
    where ${shipments.transactionId} = ${transactions.transactionId}
      and ((${shipments.trackingNumber} is not null and ${shipments.status} <> 'CANCELLED') or ${shipments.status} = 'COMPLETED')
  )`;
  const due = await db
    .select({ id: transactions.transactionId })
    .from(transactions)
    .where(
      and(
        saleWhere(sellerId, currency),
        gt(transactions.initiatedAt, new Date(now.getTime() - HISTORY_DAYS * DAY)),
        lte(transactions.initiatedAt, now),
        or(isNull(transactions.trackersCheckedAt), lt(transactions.trackersCheckedAt, new Date(now.getTime() - TRACKER_RECHECK_MS))),
        sql`not ${settled}`,
      ),
    )
    // Never-checked first, then newest orders first.
    .orderBy(sql`${transactions.trackersCheckedAt} asc nulls first`, desc(transactions.initiatedAt), asc(transactions.transactionId))
    .limit(TRACKERS_PER_RUN);

  for (const { id } of due) {
    let res;
    try {
      res = await paypal.request<{ trackers?: PayPalTracker[] }>("GET", `/v1/shipping/trackers?transaction_id=${encodeURIComponent(id)}`);
    } catch (err) {
      if (!(err instanceof PayPalUnknownOutcome)) throw err;
      return fail(db, sellerId, report, err.message, null, now);
    }
    report.requests++;
    if (res.status !== 200) return fail(db, sellerId, report, `Trackers HTTP ${res.status} for ${id}`, res.debugId, now);

    for (const t of res.body?.trackers ?? []) {
      const row = {
        sellerId,
        transactionId: id,
        trackerId: trackerIdOf(t, id),
        trackingNumber: t.tracking_number ?? null,
        carrier: t.carrier ?? null,
        status: t.status,
        source: "paypal_read",
      };
      await db
        .insert(shipments)
        .values(row)
        .onConflictDoUpdate({
          target: shipments.trackerId,
          set: { trackingNumber: row.trackingNumber, carrier: row.carrier, status: row.status },
        });
      report.upserted++;
    }
    await db.update(transactions).set({ trackersCheckedAt: now }).where(eq(transactions.transactionId, id));
  }

  await recordRun(db, sellerId, report, now);
  return report;
}

/** PayPal's tracker ID from its self link, e.g. `1GB72668J97404239-STANDINGD1PHY01` or `3WJ…-NOTRACKER`. */
function trackerIdOf(t: PayPalTracker, transactionId: string): string {
  const self = t.links?.find((l) => l.rel === "self")?.href;
  if (self) return decodeURIComponent(new URL(self).pathname.split("/").pop()!);
  return `${transactionId}-${t.tracking_number ?? "NOTRACKER"}`;
}

async function fail(db: Db, sellerId: string, report: SyncReport, error: string, debugId: string | null, now: Date) {
  const failed = { ...report, ok: false, error, debugId };
  await recordRun(db, sellerId, failed, now);
  return failed;
}
