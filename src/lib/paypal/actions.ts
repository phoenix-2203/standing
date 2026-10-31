import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { actions } from "@/db/schema";
import { type Method, type PayPalClient, PayPalUnknownOutcome } from "./client";

export type Action = typeof actions.$inferSelect;

export interface ActionSpec {
  type: string;
  method: Exclude<Method, "GET">;
  path: string;
  payload?: unknown;
  // Stable per logical action, e.g. `track-${captureId}`; reused on every retry.
  requestId: string;
}

export type SendResult =
  | { outcome: "sent" | "failed"; action: Action; fromStore: boolean }
  | { outcome: "unknown"; action: Action }
  | { outcome: "cancelled"; action: Action };

/**
 * Send a PayPal write at most once per request ID and keep PayPal's first answer as the record.
 *
 * - Already answered → return the stored response without calling PayPal again.
 * - Timeout / network error / 5xx → status `unknown`; calling again retries with the same request ID.
 * - The stored payload is what gets sent, so a retry is byte-for-byte the original action.
 *
 * The preview → cancel-window steps (rule 5) happen before this; this is the "send" step.
 */
export async function sendAction(db: Db, paypal: PayPalClient, spec: ActionSpec): Promise<SendResult> {
  await db
    .insert(actions)
    .values({
      type: spec.type,
      method: spec.method,
      path: spec.path,
      payload: spec.payload ?? null,
      requestId: spec.requestId,
      status: "scheduled",
    })
    .onConflictDoNothing({ target: actions.requestId });

  const action = await load(db, spec.requestId);
  if (action.type !== spec.type || action.method !== spec.method || action.path !== spec.path) {
    throw new Error(`Request ID ${spec.requestId} already belongs to a different action (${action.type} ${action.method} ${action.path})`);
  }
  if (action.status === "cancelled") return { outcome: "cancelled", action };
  if (action.paypalHttpStatus !== null) return { outcome: outcomeOf(action), action, fromStore: true };

  await db
    .update(actions)
    .set({ attempts: sql`${actions.attempts} + 1`, updatedAt: new Date() })
    .where(eq(actions.requestId, spec.requestId));

  let res;
  try {
    res = await paypal.request(spec.method, spec.path, { body: action.payload ?? undefined, requestId: spec.requestId });
  } catch (err) {
    if (!(err instanceof PayPalUnknownOutcome)) throw err; // never sent (e.g. bad config): leave status as is
    return { outcome: "unknown", action: await markUnknown(db, spec.requestId, err.message, null) };
  }

  if (res.status >= 500) {
    // PayPal may or may not have acted; don't lock this in as the first response.
    return { outcome: "unknown", action: await markUnknown(db, spec.requestId, `HTTP ${res.status}`, res.debugId) };
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
    // Only the first answer is written; a concurrent send that answered first wins.
    .where(and(eq(actions.requestId, spec.requestId), isNull(actions.paypalHttpStatus)))
    .returning();

  if (stored) return { outcome: outcomeOf(stored), action: stored, fromStore: false };
  const first = await load(db, spec.requestId);
  return { outcome: outcomeOf(first), action: first, fromStore: true };
}

async function load(db: Db, requestId: string): Promise<Action> {
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
