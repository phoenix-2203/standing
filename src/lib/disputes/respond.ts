import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { disputes, evidenceItems, transactionItems } from "@/db/schema";

// Dispute responses (README roadmap). For a dispute PayPal reports, Standing gathers the evidence it already holds for
// the disputed payment and writes a response the seller can send in PayPal's Resolution Center. Code writes every word
// from stored records; the AI isn't involved. Standing doesn't send it: the app's PayPal access is read-only for
// disputes, and the seller should read it first. It never says how PayPal or the buyer will decide.

export const REASON_LABEL: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Buyer says the item didn't arrive",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED:
    "Buyer says the item isn't as described",
  UNAUTHORISED: "Buyer says they didn't make the payment",
  CREDIT_NOT_PROCESSED: "Buyer says a refund wasn't processed",
  DUPLICATE_TRANSACTION: "Buyer says they were charged twice",
  INCORRECT_AMOUNT: "Buyer says the amount was wrong",
  PAYMENT_BY_OTHER_MEANS: "Buyer says they paid another way",
  CANCELED_RECURRING_BILLING: "Buyer says a subscription was cancelled",
  PROBLEM_WITH_REMITTANCE: "Problem with the payment",
  OTHER: "Other reason",
};

// What usually answers each reason: Standing's suggestion, not PayPal's list (the page says so).
const HELPS: Record<
  string,
  { kinds: string[]; missing: string; href: string }
> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: {
    kinds: ["delivery", "digital_delivery"],
    missing:
      "No tracking or delivery proof is on this payment yet. Add tracking (physical) or mark it Completed with delivery proof (digital) first.",
    href: "/dashboard#tracking",
  },
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: {
    kinds: ["invoice"],
    missing:
      "No supplier invoice matches what was sold. Adding one shows where the item came from; photos and your listing go in PayPal's form directly.",
    href: "/evidence",
  },
  UNAUTHORISED: {
    kinds: ["delivery", "digital_delivery"],
    missing:
      "No tracking or delivery proof is on this payment yet. Proof of where it was delivered helps answer this.",
    href: "/dashboard#tracking",
  },
};

export interface DisputeRow {
  disputeId: string;
  reason: string;
  reasonLabel: string;
  status: string;
  stage: string | null;
  amountText: string;
  openedAt: string;
  transactionIds: string[];
  simulated: boolean;
}

const isSim = (raw: unknown) =>
  !!raw &&
  typeof raw === "object" &&
  (raw as { simulated?: unknown }).simulated === true;
const money = (amount: string | null, currency: string | null) =>
  amount
    ? `${currency ?? "USD"} ${Number(amount).toFixed(2)}`
    : "amount not given";

function toRow(d: typeof disputes.$inferSelect): DisputeRow {
  const reason = d.reason ?? "OTHER";
  return {
    disputeId: d.disputeId,
    reason,
    reasonLabel:
      REASON_LABEL[reason] ?? reason.replace(/_/g, " ").toLowerCase(),
    status: d.status,
    stage: d.stage,
    amountText: money(d.amount, d.currency),
    openedAt: d.createdAtPaypal.toISOString(),
    transactionIds: d.sellerTransactionIds,
    simulated: isSim(d.raw),
  };
}

export async function disputeRows(
  db: Db,
  sellerId: string,
): Promise<DisputeRow[]> {
  const rows = await db
    .select()
    .from(disputes)
    .where(eq(disputes.sellerId, sellerId))
    .orderBy(desc(disputes.createdAtPaypal))
    .limit(50);
  return rows.map(toRow);
}

export interface DisputeResponse {
  dispute: DisputeRow;
  evidence: { id: string; kind: string; summary: string; simulated: boolean }[];
  missing: { text: string; href: string } | null;
  draft: string;
  blanks: string[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** The response for one of this seller's disputes, or null if it isn't theirs. */
export async function disputeResponse(
  db: Db,
  sellerId: string,
  disputeId: string,
): Promise<DisputeResponse | null> {
  const [d] = await db
    .select()
    .from(disputes)
    .where(
      and(eq(disputes.sellerId, sellerId), eq(disputes.disputeId, disputeId)),
    );
  if (!d) return null;
  const dispute = toRow(d);
  const ids = d.sellerTransactionIds;

  const onPayment = ids.length
    ? await db
        .select()
        .from(evidenceItems)
        .where(
          and(
            eq(evidenceItems.sellerId, sellerId),
            inArray(evidenceItems.transactionId, ids),
          ),
        )
    : [];
  // Supplier invoices that list an item sold in the disputed payment.
  const sold = ids.length
    ? await db
        .select({ name: transactionItems.name, sku: transactionItems.sku })
        .from(transactionItems)
        .where(inArray(transactionItems.transactionId, ids))
    : [];
  const soldNames = new Set(
    sold
      .flatMap((s) => [s.name, s.sku])
      .filter((x): x is string => !!x)
      .map(norm),
  );
  const invoices = soldNames.size
    ? (
        await db
          .select()
          .from(evidenceItems)
          .where(
            and(
              eq(evidenceItems.sellerId, sellerId),
              eq(evidenceItems.kind, "invoice"),
            ),
          )
      ).filter((e) =>
        ((e.facts.lines as { description?: string }[] | undefined) ?? []).some(
          (l) =>
            typeof l.description === "string" &&
            soldNames.has(norm(l.description)),
        ),
      )
    : [];

  const order = ["txn", "delivery", "digital_delivery", "invoice"];
  const evidence = [...onPayment, ...invoices]
    .sort(
      (a, b) =>
        order.indexOf(a.kind) - order.indexOf(b.kind) ||
        a.occurredAt.getTime() - b.occurredAt.getTime(),
    )
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      summary: e.summary,
      simulated: e.simulated,
    }));

  const help = HELPS[dispute.reason];
  const missing =
    help && !evidence.some((e) => help.kinds.includes(e.kind))
      ? { text: help.missing, href: help.href }
      : null;

  const lines = [
    `Dispute ${dispute.disputeId}: ${dispute.reasonLabel.toLowerCase()}.`,
    `Payment ${ids.join(", ") || "[PAYMENT ID]"}, ${dispute.amountText}.`,
    "",
    "Here is what my records show:",
    ...(evidence.length
      ? evidence.map((e, i) => `${i + 1}. ${e.summary}`)
      : ["[ADD WHAT YOUR RECORDS SHOW]"]),
    "",
    "[ANYTHING ELSE THE BUYER OR PAYPAL SHOULD KNOW, IN YOUR OWN WORDS]",
    "",
    "I'm happy to provide anything else you need to review this.",
    "[YOUR NAME]",
  ];
  const draft = lines.join("\n");
  const blanks = [
    ...new Set([...draft.matchAll(/\[[A-Z0-9 ,.'-]+\]/g)].map((m) => m[0])),
  ];
  return { dispute, evidence, missing, draft, blanks };
}

export const SIMULATED_PREFIX = "SIM-";

/** A clearly simulated dispute on a real sandbox payment, for the demo (the sandbox seller has no real dispute). */
export async function addSimulatedDispute(
  db: Db,
  sellerId: string,
  transactionId: string,
  amount: string,
  now = new Date(),
) {
  const disputeId = `${SIMULATED_PREFIX}PP-D-${transactionId}`;
  await db
    .insert(disputes)
    .values({
      disputeId,
      sellerId,
      createdAtPaypal: now,
      status: "OPEN",
      reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
      stage: "INQUIRY",
      currency: "USD",
      amount,
      sellerTransactionIds: [transactionId],
      raw: {
        simulated: true,
        note: "Created by npm run demo:dispute; not from PayPal",
      },
    })
    .onConflictDoNothing();
  return disputeId;
}
