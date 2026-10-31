import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { actions } from "@/db/schema";
import { type Method, type PayPalClient, PayPalUnknownOutcome } from "./client";

// The safe-fix queue (CLAUDE.md rule 5): every PayPal write goes preview → cancel window → send → store
// PayPal's response. Nothing reaches PayPal without a preview the seller approved and a cancel window
// that ran out.

export type Action = typeof actions.$inferSelect;

export const CANCEL_WINDOW_MS = 2 * 60_000;
// A send that started this long ago and never finished (process died mid-call) may be claimed again.
// PayPal's idempotency on the same request ID makes the retry safe.
const STALE_SENDING_MS = 5 * 60_000;

export interface ActionSpec {
  type: string;
  method: Exclude<Method, "GET">;
  path: string;
  payload?: unknown;
  // Stable per logical action, e.g. `track-${captureId}-${trackingNumber}`; reused on every retry.
  requestId: string;
  // What the seller sees before approving: exactly what will be sent, in plain words.
  summary: string;
}

export type SendResult =
  | { outcome: "sent" | "failed"; action: Action; fromStore: boolean }
  | { outcome: "unknown" | "cancelled" | "not_approved" | "in_window" | "in_flight"; action: Action };

/** Step 1: record the action as a preview. Calling again with the same request ID returns the same action. */
export async function previewAction(db: Db, spec: ActionSpec): Promise<Action> {
  await db
    .insert(actions)
    .values({
      type: spec.type,
      method: spec.method,
      path: spec.path,
      payload: spec.payload ?? null,
      requestId: spec.requestId,
      summary: spec.summary,
      status: "preview",
    })
    .onConflictDoNothing({ target: actions.requestId });
  const action = await load(db, spec.requestId);
  if (action.type !== spec.type || action.method !== spec.method || action.path !== spec.path) {
    throw new Error(`Request ID ${spec.requestId} already belongs to a different action (${action.type} ${action.method} ${action.path})`);
  }
  return action;
}

/** Step 2: the seller approves; the cancel window starts. Only a preview can be approved. */
export async function approveAction(db: Db, requestId: string, now = new Date(), windowMs = CANCEL_WINDOW_MS): Promise<Action> {
  const [row] = await db
    .update(actions)
    .set({ status: "scheduled", undoUntil: new Date(now.getTime() + windowMs), updatedAt: now })
    .where(and(eq(actions.requestId, requestId), eq(actions.status, "preview")))
    .returning();
  return row ?? load(db, requestId);
}

/** Cancel before anything is sent: a preview at any time, a scheduled action only inside its window. */
export async function cancelAction(db: Db, requestId: string, now = new Date()): Promise<{ cancelled: boolean; action: Action }> {
  const [row] = await db
    .update(actions)
    .set({ status: "cancelled", updatedAt: now })
    .where(
      and(
        eq(actions.requestId, requestId),
        or(eq(actions.status, "preview"), and(eq(actions.status, "scheduled"), sql`${actions.undoUntil} > ${now}`)),
      ),
    )
    .returning();
  return row ? { cancelled: true, action: row } : { cancelled: false, action: await load(db, requestId) };
}

/**
 * Step 3: send once the window has run out, at most once per request ID, and keep PayPal's first answer.
 *
 * - The action is claimed atomically (status `sending`), so a double click or two workers make one call.
 * - Already answered → the stored response, no new call.
 * - Timeout / network error / 5xx → `unknown`; sending again retries with the same request ID and the
 *   stored payload, byte for byte.
 */
export async function sendAction(db: Db, paypal: PayPalClient, requestId: string, now = new Date()): Promise<SendResult> {
  const action = await load(db, requestId);
  if (action.paypalHttpStatus !== null) return { outcome: outcomeOf(action), action, fromStore: true };
  if (action.status === "cancelled") return { outcome: "cancelled", action };
  if (action.status === "preview") return { outcome: "not_approved", action };
  if (action.undoUntil && action.undoUntil > now) return { outcome: "in_window", action };

  const [claimed] = await db
    .update(actions)
    .set({ status: "sending", attempts: sql`${actions.attempts} + 1`, updatedAt: now })
    .where(
      and(
        eq(actions.requestId, requestId),
        isNull(actions.paypalHttpStatus),
        lte(actions.undoUntil, now),
        or(
          inArray(actions.status, ["scheduled", "unknown"]),
          and(eq(actions.status, "sending"), lt(actions.updatedAt, new Date(now.getTime() - STALE_SENDING_MS))),
        ),
      ),
    )
    .returning();
  if (!claimed) {
    const current = await load(db, requestId);
    if (current.paypalHttpStatus !== null) return { outcome: outcomeOf(current), action: current, fromStore: true };
    return { outcome: current.status === "cancelled" ? "cancelled" : "in_flight", action: current };
  }

  let res;
  try {
    res = await paypal.request(claimed.method as ActionSpec["method"], claimed.path, {
      body: claimed.payload ?? undefined,
      requestId,
    });
  } catch (err) {
    if (!(err instanceof PayPalUnknownOutcome)) {
      // Never reached PayPal (e.g. bad config): hand the action back so it can be retried.
      await db.update(actions).set({ status: "scheduled", lastError: (err as Error).message }).where(eq(actions.requestId, requestId));
      throw err;
    }
    return { outcome: "unknown", action: await markUnknown(db, requestId, err.message, null) };
  }

  if (res.status >= 500) {
    // PayPal may or may not have acted; don't lock this in as the first response.
    return { outcome: "unknown", action: await markUnknown(db, requestId, `HTTP ${res.status}`, res.debugId) };
  }

  const [stored] = await db
    .update(actions)
    .set({
      status: res.status < 300 ? "sent" : "failed",
      paypalHttpStatus: res.status,
      paypalDebugId: res.debugId,
      paypalResponse: res.body,
      respondedAt: new Date(),
      lastError: res.status < 300 ? null : `HTTP ${res.status}`,
      updatedAt: new Date(),
    })
    // Only the first answer is ever written.
    .where(and(eq(actions.requestId, requestId), isNull(actions.paypalHttpStatus)))
    .returning();
  if (stored) return { outcome: outcomeOf(stored), action: stored, fromStore: false };
  const first = await load(db, requestId);
  return { outcome: outcomeOf(first), action: first, fromStore: true };
}

export async function load(db: Db, requestId: string): Promise<Action> {
  const [row] = await db.select().from(actions).where(eq(actions.requestId, requestId));
  if (!row) throw new Error(`Action ${requestId} not found`);
  return row;
}

async function markUnknown(db: Db, requestId: string, error: string, debugId: string | null): Promise<Action> {
  const [row] = await db
    .update(actions)
    .set({ status: "unknown", lastError: debugId ? `${error} (debug ${debugId})` : error, updatedAt: new Date() })
    .where(and(eq(actions.requestId, requestId), isNull(actions.paypalHttpStatus)))
    .returning();
  return row ?? load(db, requestId);
}

function outcomeOf(action: Action): "sent" | "failed" {
  return action.paypalHttpStatus !== null && action.paypalHttpStatus < 300 ? "sent" : "failed";
}
