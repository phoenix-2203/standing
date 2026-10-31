import type { Db } from "@/db";
import { disputes } from "@/db/schema";
import { type PayPalClient, type PayPalResponse, PayPalUnknownOutcome } from "@/lib/paypal/client";
import { DAY, getSyncedThrough, HOUR, paypalDateMs, recordRun, type SyncReport } from "./state";

export const DISPUTES_BACKFILL_DAYS = 90;
const OVERLAP_MS = 1 * HOUR;
const PAGE_SIZE = 50;
const MAX_PAGES = 100; // guard against a `next` link that never ends

export interface DisputeSummary {
  dispute_id: string;
  create_time: string;
  update_time?: string;
  status: string;
  reason?: string;
  dispute_life_cycle_stage?: string;
  dispute_amount?: { currency_code: string; value: string };
  disputed_transactions?: { seller_transaction_id?: string }[];
}

interface DisputePage {
  items?: DisputeSummary[];
  links?: { rel: string; href: string }[];
}

/** Upserts every dispute updated since the last run (first run: the last 90 days). Read-only. */
export async function syncDisputes(db: Db, paypal: PayPalClient, sellerId: string, now = new Date()): Promise<SyncReport> {
  const cursor = await getSyncedThrough(db, sellerId, "disputes");
  const since = cursor ? new Date(cursor.getTime() - OVERLAP_MS) : new Date(now.getTime() - DISPUTES_BACKFILL_DAYS * DAY);
  const report: SyncReport = { job: "disputes", ok: true, upserted: 0, requests: 0, syncedThrough: cursor };

  // `update_time_after` catches status changes on old disputes too, not just new ones.
  let path: string | null = `/v1/customer/disputes?update_time_after=${paypalDateMs(since)}&page_size=${PAGE_SIZE}`;
  try {
    while (path && report.requests < MAX_PAGES) {
      const res: PayPalResponse<DisputePage> = await paypal.request<DisputePage>("GET", path);
      report.requests++;
      if (res.status !== 200 || !res.body) {
        const failed = { ...report, ok: false, error: `Disputes HTTP ${res.status}`, debugId: res.debugId };
        await recordRun(db, sellerId, failed, now);
        return failed;
      }
      for (const d of res.body.items ?? []) {
        await upsertDispute(db, sellerId, d);
        report.upserted++;
      }
      path = nextPath(res.body.links);
    }
  } catch (err) {
    if (!(err instanceof PayPalUnknownOutcome)) throw err;
    const failed = { ...report, ok: false, error: err.message, debugId: null };
    await recordRun(db, sellerId, failed, now);
    return failed;
  }

  report.syncedThrough = now;
  await recordRun(db, sellerId, report, now);
  return report;
}

export async function upsertDispute(db: Db, sellerId: string, d: DisputeSummary): Promise<void> {
  const row = {
    disputeId: d.dispute_id,
    sellerId,
    createdAtPaypal: new Date(d.create_time),
    updatedAtPaypal: d.update_time ? new Date(d.update_time) : null,
    status: d.status,
    reason: d.reason ?? null,
    stage: d.dispute_life_cycle_stage ?? null,
    currency: d.dispute_amount?.currency_code ?? null,
    amount: d.dispute_amount?.value ?? null,
    sellerTransactionIds: (d.disputed_transactions ?? []).flatMap((t) => (t.seller_transaction_id ? [t.seller_transaction_id] : [])),
    raw: d,
    syncedAt: new Date(),
  };
  await db.insert(disputes).values(row).onConflictDoUpdate({ target: disputes.disputeId, set: row });
}

/** PayPal returns absolute `next` links; the client only takes paths on the sandbox host. */
function nextPath(links: DisputePage["links"]): string | null {
  const next = links?.find((l) => l.rel === "next")?.href;
  if (!next) return null;
  const url = new URL(next);
  return url.pathname + url.search;
}
