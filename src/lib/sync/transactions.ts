import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { transactionItems, transactions } from "@/db/schema";
import { type PayPalClient, PayPalUnknownOutcome } from "@/lib/paypal/client";
import { DAY, getSyncedThrough, HOUR, paypalDate, recordRun, type SyncReport } from "./state";

// First run reaches back far enough for every metric (the 90-day dispute rate is the longest).
export const TRANSACTIONS_BACKFILL_DAYS = 90;
// Transaction Search data lags up to 3 h, so each run re-reads the last 3 h before the cursor.
export const TRANSACTIONS_OVERLAP_MS = 3 * HOUR;
// PayPal allows at most 31 days per request (32 → 400 "Date range", seen 31 Oct, debug ca5334446fadd).
const MAX_WINDOW_MS = 31 * DAY;
const PAGE_SIZE = 500;

interface Money {
  currency_code: string;
  value: string;
}

export interface TxnDetail {
  transaction_info: {
    transaction_id: string;
    transaction_event_code: string;
    transaction_status: string;
    transaction_initiation_date: string;
    transaction_updated_date?: string;
    transaction_amount: Money;
    paypal_reference_id?: string;
  };
  cart_info?: {
    item_details?: { item_name?: string; item_code?: string; item_quantity?: string; item_unit_price?: Money }[];
  };
}

interface SearchPage {
  transaction_details?: TxnDetail[];
  page?: number;
  total_pages?: number;
  last_refreshed_datetime?: string;
}

export async function syncTransactions(db: Db, paypal: PayPalClient, sellerId: string, now = new Date()): Promise<SyncReport> {
  const cursor = await getSyncedThrough(db, sellerId, "transactions");
  let from = cursor
    ? new Date(cursor.getTime() - TRANSACTIONS_OVERLAP_MS)
    : new Date(now.getTime() - TRANSACTIONS_BACKFILL_DAYS * DAY);
  const report: SyncReport = { job: "transactions", ok: true, upserted: 0, requests: 0, syncedThrough: cursor };

  try {
    while (from < now) {
      const to = new Date(Math.min(from.getTime() + MAX_WINDOW_MS, now.getTime()));
      let refreshedThrough = to;
      for (let page = 1; ; page++) {
        const res = await paypal.request<SearchPage>(
          "GET",
          `/v1/reporting/transactions?start_date=${paypalDate(from)}&end_date=${paypalDate(to)}` +
            `&fields=all&page_size=${PAGE_SIZE}&page=${page}`,
        );
        report.requests++;
        if (res.status !== 200 || !res.body) {
          return await fail(db, sellerId, report, `Transaction Search HTTP ${res.status}`, res.debugId, now);
        }
        for (const detail of res.body.transaction_details ?? []) {
          await upsertTransaction(db, sellerId, detail);
          report.upserted++;
        }
        // Data after PayPal's last refresh isn't in this answer yet; don't move the cursor past it.
        if (res.body.last_refreshed_datetime) {
          const refreshed = new Date(res.body.last_refreshed_datetime);
          if (refreshed < refreshedThrough) refreshedThrough = refreshed;
        }
        if (page >= (res.body.total_pages ?? 1)) break;
      }
      report.syncedThrough = refreshedThrough;
      from = to;
    }
  } catch (err) {
    if (!(err instanceof PayPalUnknownOutcome)) throw err;
    return await fail(db, sellerId, report, err.message, null, now);
  }

  await recordRun(db, sellerId, report, now);
  return report;
}

async function fail(db: Db, sellerId: string, report: SyncReport, error: string, debugId: string | null, now: Date) {
  const failed = { ...report, ok: false, error, debugId };
  await recordRun(db, sellerId, failed, now);
  return failed;
}

export async function upsertTransaction(db: Db, sellerId: string, detail: TxnDetail): Promise<void> {
  const info = detail.transaction_info;
  const row = {
    transactionId: info.transaction_id,
    sellerId,
    eventCode: info.transaction_event_code,
    status: info.transaction_status,
    initiatedAt: new Date(info.transaction_initiation_date),
    updatedAt: info.transaction_updated_date ? new Date(info.transaction_updated_date) : null,
    currency: info.transaction_amount.currency_code,
    amount: info.transaction_amount.value,
    paypalReferenceId: info.paypal_reference_id ?? null,
    raw: detail,
    syncedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx.insert(transactions).values(row).onConflictDoUpdate({ target: transactions.transactionId, set: row });
    await tx.delete(transactionItems).where(eq(transactionItems.transactionId, info.transaction_id));
    const items = detail.cart_info?.item_details ?? [];
    if (items.length) {
      await tx.insert(transactionItems).values(
        items.map((item, position) => ({
          transactionId: info.transaction_id,
          position,
          name: item.item_name ?? null,
          sku: item.item_code ?? null,
          quantity: item.item_quantity ? Number.parseInt(item.item_quantity, 10) : null,
          unitAmount: item.item_unit_price?.value ?? null,
        })),
      );
    }
  });
}
