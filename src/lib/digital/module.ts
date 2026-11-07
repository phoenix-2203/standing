import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { actions, evidenceItems, transactions } from "@/db/schema";
import type { Evidence } from "@/lib/evidence/ledger";
import { markCompleted, previewFix } from "@/lib/fixes/fixes";
import { DAY } from "@/lib/metrics/compute";
import { loadMetricsInput } from "@/lib/metrics/load";
import { type Action, approveAction, reopenCancelled } from "@/lib/paypal/actions";

// Digital-seller module: orders that can't have a tracking number. Wording is fixed: the fix "marks the
// order Completed". Nothing here may say it releases funds; PayPal's documents don't tie this API status
// to hold release (TESTS.md, day-1 test 5).

export const FIX_DESCRIPTION = "Marks the order Completed in PayPal.";

export interface DigitalGap {
  transactionId: string;
  at: string;
  cents: number;
  kind: "digital" | "service";
  fixDescription: string;
  // The order's fix so far, if the seller has started one.
  fix: { requestId: string; status: Action["status"]; undoUntil: string | null } | null;
  proofs: string[]; // evidence IDs of the seller's delivery records for this order
}

/** Digital and service orders more than 24 hours old, not yet marked Completed in PayPal. */
export async function listDigitalGaps(db: Db, sellerId: string, now = new Date()): Promise<DigitalGap[]> {
  const { sales } = await loadMetricsInput(db, sellerId, now);
  const gaps = sales.filter((s) => (s.kind === "digital" || s.kind === "service") && s.at.getTime() <= now.getTime() - DAY && !s.completed);
  if (!gaps.length) return [];
  const ids = gaps.map((g) => g.id);
  const [fixes, proofs] = await Promise.all([
    db.select().from(actions).where(and(eq(actions.sellerId, sellerId), inArray(actions.requestId, ids.map((id) => `complete-${id}`)))),
    db
      .select({ id: evidenceItems.id, transactionId: evidenceItems.transactionId })
      .from(evidenceItems)
      .where(and(eq(evidenceItems.sellerId, sellerId), eq(evidenceItems.source, "seller"), eq(evidenceItems.kind, "digital_delivery"), inArray(evidenceItems.transactionId, ids))),
  ]);
  return gaps
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((g) => {
      const fix = fixes.find((f) => f.requestId === `complete-${g.id}`);
      return {
        transactionId: g.id,
        at: g.at.toISOString(),
        cents: g.cents,
        kind: g.kind as "digital" | "service",
        fixDescription: FIX_DESCRIPTION,
        fix: fix ? { requestId: fix.requestId, status: fix.status, undoUntil: fix.undoUntil?.toISOString() ?? null } : null,
        proofs: proofs.filter((p) => p.transactionId === g.id).map((p) => p.id),
      };
    });
}

/** The seller's proof input is invalid; the message is safe to show them. */
export class InvalidProof extends Error {}

export class NotAGap extends Error {}

/**
 * The one click: preview and approve the fix, which starts its cancel window. Sending happens after the
 * window (each cycle, or an explicit send). Only an order on the seller's own gap list can be fixed.
 */
export async function completeOrder(db: Db, sellerId: string, captureId: string, now = new Date()): Promise<Action> {
  const gaps = await listDigitalGaps(db, sellerId, now);
  if (!gaps.some((g) => g.transactionId === captureId)) throw new NotAGap(`Payment ${captureId} isn't a digital order waiting to be marked Completed`);
  const spec = markCompleted({ sellerId, captureId });
  await previewFix(db, spec);
  await reopenCancelled(db, spec.requestId, now);
  return approveAction(db, spec.requestId, now);
}

export const DELIVERY_METHODS = { email: "sent by email", download_link: "download link", account_access: "account access", other: "other method" } as const;

export interface DeliveryProofInput {
  transactionId: string;
  method: keyof typeof DELIVERY_METHODS;
  deliveredOn: string; // YYYY-MM-DD
  reference?: string; // e.g. a download log or email reference; data, never instructions
  simulated?: boolean;
}

/** The seller's record that a digital order was delivered: evidence for the pack, labelled as theirs. */
export async function addDeliveryProof(db: Db, sellerId: string, proof: DeliveryProofInput, now = new Date()): Promise<Evidence> {
  const [sale] = await db.select().from(transactions).where(and(eq(transactions.sellerId, sellerId), eq(transactions.transactionId, String(proof.transactionId))));
  if (!sale) throw new NotAGap(`Payment ${proof.transactionId} isn't one of this seller's payments`);
  if (!Object.hasOwn(DELIVERY_METHODS, proof.method)) throw new InvalidProof(`Delivery method must be one of: ${Object.keys(DELIVERY_METHODS).join(", ")}`);
  if (typeof proof.deliveredOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(proof.deliveredOn) || Number.isNaN(Date.parse(proof.deliveredOn))) throw new InvalidProof("Delivery date must be YYYY-MM-DD");
  if (proof.deliveredOn > now.toISOString().slice(0, 10)) throw new InvalidProof("Delivery date can't be in the future");
  if (proof.reference != null && typeof proof.reference !== "string") throw new InvalidProof("Reference must be text");
  const reference = proof.reference?.trim();
  if (reference && !/^[\w .:/#-]{1,80}$/.test(reference)) throw new InvalidProof("Reference must be up to 80 letters, digits or simple punctuation");

  const hash = createHash("sha256").update(JSON.stringify([proof.method, proof.deliveredOn, reference ?? ""])).digest("hex").slice(0, 8).toUpperCase();
  const item = {
    sellerId,
    id: `EV-DLV-${sale.transactionId}-${hash}`,
    kind: "digital_delivery" as const,
    transactionId: sale.transactionId,
    occurredAt: new Date(`${proof.deliveredOn}T00:00:00Z`),
    summary:
      `${proof.simulated ? "Simulated: " : ""}Digital delivery record added by the seller for PayPal payment ${sale.transactionId}: ` +
      `${DELIVERY_METHODS[proof.method]} on ${proof.deliveredOn}${reference ? `, reference ${reference}` : ""}.`,
    facts: { transactionId: sale.transactionId, method: proof.method, deliveredOn: proof.deliveredOn, reference: reference ?? null },
    source: "seller",
    simulated: proof.simulated ?? false,
  };
  const [row] = await db
    .insert(evidenceItems)
    .values({ ...item, updatedAt: now })
    .onConflictDoUpdate({ target: [evidenceItems.sellerId, evidenceItems.id], set: { summary: item.summary, updatedAt: now } })
    .returning();
  return row;
}
