import { and, desc, eq, like, or } from "drizzle-orm";
import type { Db } from "@/db";
import { actions, shopOrders } from "@/db/schema";
import { DAY } from "@/lib/metrics/compute";
import { loadMetricsInput } from "@/lib/metrics/load";
import { type Action, approveAction, reopenCancelled } from "@/lib/paypal/actions";
import { previewFix, trackingPush } from "./fixes";

// Physical orders with no tracking in PayPal. The number and carrier always come from the seller; neither
// code nor AI ever makes one up (CLAUDE.md rule 3). Nothing here may say tracking releases funds.

const LIVE: Action["status"][] = ["preview", "scheduled", "sending", "unknown"];

export interface TrackingGap {
  transactionId: string;
  at: string;
  cents: number;
  overdue: boolean; // over 48 hours old: what the tracking coverage figure counts
  fix: { requestId: string; status: Action["status"]; summary: string | null; undoUntil: string | null } | null;
}

export class InvalidTracking extends Error {}
export class NotATrackingGap extends Error {}

async function fixesFor(db: Db, sellerId: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select()
    .from(actions)
    .where(and(eq(actions.sellerId, sellerId), or(...ids.map((id) => like(actions.requestId, `track-${id}-%`)))))
    .orderBy(desc(actions.updatedAt));
}

export async function listTrackingGaps(db: Db, sellerId: string, now = new Date()): Promise<TrackingGap[]> {
  const { sales } = await loadMetricsInput(db, sellerId, now);
  const gaps = sales.filter((s) => s.kind === "physical" && !s.hasTracking);
  const fixes = await fixesFor(db, sellerId, gaps.map((g) => g.id));
  return gaps
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((g) => {
      const fix = fixes.find((f) => f.requestId.startsWith(`track-${g.id}-`));
      return {
        transactionId: g.id,
        at: g.at.toISOString(),
        cents: g.cents,
        overdue: g.at.getTime() <= now.getTime() - 2 * DAY,
        fix: fix ? { requestId: fix.requestId, status: fix.status, summary: fix.summary, undoUntil: fix.undoUntil?.toISOString() ?? null } : null,
      };
    });
}

export interface TrackingInput {
  trackingNumber?: unknown;
  carrier?: unknown;
  carrierNameOther?: unknown;
}

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Preview and approve a tracking number, which starts its cancel window. Sending happens after the window.
 * Only an order on the seller's own list can be fixed, and only one number can be in the queue at a time.
 */
export async function addTracking(db: Db, sellerId: string, captureId: string, input: TrackingInput, now = new Date()): Promise<Action> {
  const gaps = await listTrackingGaps(db, sellerId, now);
  if (!gaps.some((g) => g.transactionId === captureId)) throw new NotATrackingGap(`Payment ${captureId} isn't a physical order waiting for tracking`);

  const [shop] = await db.select({ orderId: shopOrders.orderId }).from(shopOrders).where(and(eq(shopOrders.sellerId, sellerId), eq(shopOrders.captureId, captureId)));
  let spec;
  try {
    spec = trackingPush({ sellerId, orderId: shop?.orderId ?? null, captureId, trackingNumber: clean(input.trackingNumber), carrier: clean(input.carrier), carrierNameOther: clean(input.carrierNameOther) });
  } catch (err) {
    throw new InvalidTracking(err instanceof Error ? err.message : "That tracking number can't be used");
  }

  const other = (await fixesFor(db, sellerId, [captureId])).find((f) => f.requestId !== spec.requestId && LIVE.includes(f.status));
  if (other) throw new InvalidTracking("Another tracking number is already queued for this order. Cancel it first.");

  await previewFix(db, spec);
  await reopenCancelled(db, spec.requestId, now);
  return approveAction(db, spec.requestId, now);
}
