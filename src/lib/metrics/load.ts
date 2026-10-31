import { and, eq, gt, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { disputes, metricsDaily, products, shipments, transactionItems, transactions } from "@/db/schema";
import { computeMetrics, DAY, HISTORY_DAYS, type Kind, type Metrics, type Sale, toCents } from "./compute";

type TxnRow = typeof transactions.$inferSelect;

/**
 * A sale ("order") = money received: event code group T00xx (PayPal payments), success or pending,
 * positive amount, in the seller's currency. Refunds/reversals (negative, other groups) and denied or
 * reversed payments are not orders.
 */
export function isSale(t: Pick<TxnRow, "eventCode" | "status" | "amount" | "currency">, currency: string): boolean {
  return t.eventCode.startsWith("T00") && (t.status === "S" || t.status === "P") && t.currency === currency && toCents(t.amount) > 0;
}

export async function loadMetricsInput(db: Db, sellerId: string, asOf: Date, currency = "USD") {
  const from = new Date(asOf.getTime() - HISTORY_DAYS * DAY);
  const txns = (
    await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.sellerId, sellerId), gt(transactions.initiatedAt, from), lte(transactions.initiatedAt, asOf)))
  ).filter((t) => isSale(t, currency));
  const ids = txns.map((t) => t.transactionId);

  const [items, catalogue, tracked, disputeRows] = await Promise.all([
    ids.length ? db.select().from(transactionItems).where(inArray(transactionItems.transactionId, ids)) : [],
    db.select().from(products).where(eq(products.sellerId, sellerId)),
    ids.length ? db.select().from(shipments).where(inArray(shipments.transactionId, ids)) : [],
    db
      .select({ createdAt: disputes.createdAtPaypal })
      .from(disputes)
      .where(and(eq(disputes.sellerId, sellerId), gt(disputes.createdAtPaypal, from), lte(disputes.createdAtPaypal, asOf))),
  ]);

  const bySku = new Map(catalogue.filter((p) => p.sku).map((p) => [p.sku!, p]));
  const byName = new Map(catalogue.map((p) => [p.name.trim().toLowerCase(), p]));

  const sales: Sale[] = txns.map((t) => {
    const matched = items
      .filter((i) => i.transactionId === t.transactionId)
      .map((i) => (i.sku && bySku.get(i.sku)) || (i.name && byName.get(i.name.trim().toLowerCase())) || null)
      .filter((p) => p !== null);
    const kinds = new Set(matched.map((p) => p.kind).filter((k): k is Kind => k !== null));
    const ship = tracked.filter((s) => s.transactionId === t.transactionId);
    return {
      id: t.transactionId,
      at: t.initiatedAt,
      cents: toCents(t.amount),
      // Any physical item means the order needs tracking.
      kind: kinds.has("physical") ? "physical" : kinds.has("digital") ? "digital" : kinds.has("service") ? "service" : null,
      categories: [...new Set(matched.map((p) => p.category).filter((c): c is string => !!c))],
      hasTracking: ship.some((s) => s.trackingNumber !== null && s.status !== "CANCELLED"),
      completed: ship.some((s) => s.status === "COMPLETED"),
    };
  });

  return { asOf, sales, disputeCreatedAt: disputeRows.map((d) => d.createdAt) };
}

/** Compute and store today's snapshot (one row per seller per UTC day; later runs overwrite). */
export async function runMetrics(db: Db, sellerId: string, asOf = new Date(), currency = "USD"): Promise<Metrics> {
  const metrics = computeMetrics(await loadMetricsInput(db, sellerId, asOf, currency));
  const row = { sellerId, day: asOf.toISOString().slice(0, 10), asOf, currency, values: metrics };
  await db
    .insert(metricsDaily)
    .values(row)
    .onConflictDoUpdate({ target: [metricsDaily.sellerId, metricsDaily.day], set: row });
  return metrics;
}
