import { and, eq, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { actions, shipments } from "@/db/schema";
import { type Action, type ActionSpec, previewAction, sendAction, type SendResult } from "@/lib/paypal/actions";
import type { PayPalClient } from "@/lib/paypal/client";

// The two safe fixes (BLUEPRINT §2.4 and the digital module). The tracking number and carrier always come
// from the seller; neither code nor AI ever makes one up (CLAUDE.md rule 3).

const PAYPAL_ID = /^[A-Za-z0-9]{1,50}$/;
// PayPal: ASCII only, no URL/phone/email formats; 1–64 characters.
const TRACKING_NUMBER = /^[A-Za-z0-9-]{1,64}$/;

export interface TrackingPushInput {
  sellerId: string;
  orderId?: string | null; // known for demo-shop orders; PayPal's Transaction Search doesn't report it
  captureId: string;
  trackingNumber: string;
  carrier: string; // PayPal carrier code, e.g. USPS, UPS, DHL, OTHER
  carrierNameOther?: string; // required when carrier is OTHER
}

/**
 * Physical order: add a tracking number. Orders v2 `POST /v2/checkout/orders/{id}/track` when the order ID is
 * known; otherwise `POST /v1/shipping/trackers`, which needs only the transaction ID.
 */
export function trackingPush(input: TrackingPushInput): ActionSpec {
  if ((input.orderId && !PAYPAL_ID.test(input.orderId)) || !PAYPAL_ID.test(input.captureId)) throw new Error("Order and capture IDs must be PayPal IDs");
  if (!TRACKING_NUMBER.test(input.trackingNumber)) throw new Error("Tracking number must be 1–64 letters, digits or dashes");
  if (!/^[A-Z0-9_]{2,40}$/.test(input.carrier)) throw new Error("Carrier must be a PayPal carrier code, e.g. USPS");
  if (input.carrier === "OTHER" && !input.carrierNameOther?.trim()) throw new Error("Carrier OTHER needs the carrier's name");
  const carrier = { carrier: input.carrier, ...(input.carrier === "OTHER" ? { carrier_name_other: input.carrierNameOther!.trim() } : {}) };
  return {
    sellerId: input.sellerId,
    type: "tracking_push",
    method: "POST",
    ...(input.orderId
      ? {
          path: `/v2/checkout/orders/${input.orderId}/track`,
          payload: { capture_id: input.captureId, tracking_number: input.trackingNumber, ...carrier, notify_payer: false },
        }
      : {
          path: "/v1/shipping/trackers",
          payload: { trackers: [{ transaction_id: input.captureId, tracking_number: input.trackingNumber, status: "SHIPPED", ...carrier, notify_buyer: false }] },
        }),
    requestId: `track-${input.captureId}-${input.trackingNumber}`,
    summary:
      `Add tracking ${input.trackingNumber} (${input.carrier === "OTHER" ? input.carrierNameOther!.trim() : input.carrier}) ` +
      `to ${input.orderId ? `PayPal order ${input.orderId}, ` : ""}payment ${input.captureId}. The buyer is not emailed.`,
  };
}

/** Digital or service order: marks the order Completed via `POST /v1/shipping/trackers` (no tracking number). */
export function markCompleted(input: { sellerId: string; captureId: string }): ActionSpec {
  if (!PAYPAL_ID.test(input.captureId)) throw new Error("Capture ID must be a PayPal ID");
  return {
    sellerId: input.sellerId,
    type: "digital_complete",
    method: "POST",
    path: "/v1/shipping/trackers",
    payload: { trackers: [{ transaction_id: input.captureId, status: "COMPLETED" }] },
    requestId: `complete-${input.captureId}`,
    // Wording agreed in the blueprint: "marks the order Completed". It never claims funds will be released.
    summary: `Marks PayPal payment ${input.captureId} as Completed (digital delivery, no tracking number).`,
  };
}

export async function previewFix(db: Db, spec: ActionSpec): Promise<Action> {
  return previewAction(db, spec);
}

/**
 * Send a due fix, then record the tracker PayPal accepted so coverage and the digital gap see it at once
 * (the read-back later finds the same tracker ID and updates that row instead of adding one).
 */
export async function sendFix(db: Db, paypal: PayPalClient, sellerId: string, requestId: string, now = new Date()): Promise<SendResult> {
  const first = await sendAction(db, paypal, requestId, now);
  const result = first.outcome === "failed" && !first.fromStore ? await settleDuplicate(db, paypal, first.action, now) : first;
  if (result.outcome === "sent") {
    const row = shipmentFor(result.action, sellerId);
    if (row) {
      await db
        .insert(shipments)
        .values(row)
        .onConflictDoUpdate({ target: shipments.trackerId, set: { status: row.status, trackingNumber: row.trackingNumber, carrier: row.carrier } });
    }
  }
  return result;
}

/**
 * `POST /v1/shipping/trackers` doesn't replay: the same request ID after a lost answer gets a 400, not the original
 * response (`DUPLICATE_TRACKER` for a tracking number, `INVALID_TRACKING_NUMBER` for Completed; TESTS.md, 7 Nov). That
 * isn't a refusal, and it isn't proof either: read the tracker back and believe PayPal's record. No answer → unknown.
 * Read back and absent: a duplicate stays unknown; the Completed error is a real refusal (the order has a tracking
 * number but isn't Completed), so it stays failed instead of retrying every cycle.
 */
async function settleDuplicate(db: Db, paypal: PayPalClient, action: Action, now: Date): Promise<SendResult> {
  const failed: SendResult = { outcome: "failed", action, fromStore: false };
  const response = JSON.stringify(action.paypalResponse ?? "");
  const duplicate = response.includes("DUPLICATE_TRACKER");
  if (!duplicate && !(action.type === "digital_complete" && response.includes("INVALID_TRACKING_NUMBER"))) return failed;
  const wanted = shipmentFor(action, action.sellerId ?? "");
  if (!wanted) return failed;
  const mark = async (status: "sent" | "unknown") => {
    const [row] = await db.update(actions).set({ status, updatedAt: now }).where(eq(actions.requestId, action.requestId)).returning();
    return row;
  };
  try {
    const back = await paypal.request<{ trackers?: { tracking_number?: string; status: string }[] }>("GET", `/v1/shipping/trackers?transaction_id=${encodeURIComponent(wanted.transactionId)}`);
    const there = back.body?.trackers?.some((t) => (wanted.trackingNumber ? t.tracking_number === wanted.trackingNumber : t.status === "COMPLETED"));
    if (there) return { outcome: "sent", action: await mark("sent"), fromStore: false };
    if (!duplicate && back.status === 200) return failed;
  } catch {
    // No answer from the read-back: fall through to unknown.
  }
  return { outcome: "unknown", action: await mark("unknown") };
}

/** Each cycle: send this seller's approved fixes whose cancel window has run out, and retry unknown outcomes. */
export async function sendDueFixes(db: Db, paypal: PayPalClient, sellerId: string, now = new Date()): Promise<SendResult[]> {
  const due = await db
    .select({ requestId: actions.requestId })
    .from(actions)
    .where(and(eq(actions.sellerId, sellerId), inArray(actions.status, ["scheduled", "unknown"]), lte(actions.undoUntil, now)));
  const results: SendResult[] = [];
  for (const { requestId } of due) results.push(await sendFix(db, paypal, sellerId, requestId, now));
  return results;
}

function shipmentFor(action: Action, sellerId: string) {
  const p = action.payload as Record<string, unknown>;
  if (action.type === "tracking_push") {
    const tracker = (p.trackers as Record<string, unknown>[] | undefined)?.[0] ?? p;
    const captureId = (tracker.capture_id ?? tracker.transaction_id) as string;
    const trackingNumber = tracker.tracking_number as string;
    return {
      sellerId,
      transactionId: captureId,
      trackerId: `${captureId}-${trackingNumber}`,
      trackingNumber,
      carrier: tracker.carrier as string,
      status: "SHIPPED",
      source: "standing_push",
    };
  }
  if (action.type === "digital_complete") {
    const captureId = (p.trackers as { transaction_id: string }[])[0].transaction_id;
    return { sellerId, transactionId: captureId, trackerId: `${captureId}-NOTRACKER`, trackingNumber: null, carrier: null, status: "COMPLETED", source: "standing_push" };
  }
  return null;
}
