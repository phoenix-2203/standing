import { and, eq, gt, inArray, like, lte, min } from "drizzle-orm";
import type { Db } from "@/db";
import { disputes, metricsDaily, products, shipments, shopOrders, transactionItems, transactions } from "@/db/schema";
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

/** SQL twin of isSale(), for queries that run in the database. Keep the two in step. */
export function saleWhere(sellerId: string, currency: string) {
  return and(
    eq(transactions.sellerId, sellerId),
    like(transactions.eventCode, "T00%"),
    inArray(transactions.status, ["S", "P"]),
    eq(transactions.currency, currency),
    gt(transactions.amount, "0"),
  );
}

/** How an order's line item finds its catalogue product: exact SKU first, then name ignoring case and outer spaces. */
export function productMatcher<P extends { sku: string | null; name: string }>(catalogue: P[]) {
  const bySku = new Map(catalogue.filter((p) => p.sku).map((p) => [p.sku!, p]));
  const byName = new Map(catalogue.map((p) => [p.name.trim().toLowerCase(), p]));
  return (item: { sku: string | null; name: string | null }): P | null =>
    (item.sku && bySku.get(item.sku)) || (item.name && byName.get(item.name.trim().toLowerCase())) || null;
}

// Orders v2 item category → kind. DONATION and unknown values don't classify an order.
const SHOP_CATEGORY_KIND: Record<string, Kind> = { PHYSICAL_GOODS: "physical", DIGITAL_GOODS: "digital" };

export function kindOf(kinds: Iterable<Kind | null | undefined>): Kind | null {
  const set = new Set(kinds);
  // Any physical item means the order needs tracking.
  return set.has("physical") ? "physical" : set.has("digital") ? "digital" : set.has("service") ? "service" : null;
}

export async function loadMetricsInput(db: Db, sellerId: string, asOf: Date, currency = "USD") {
  const from = new Date(asOf.getTime() - HISTORY_DAYS * DAY);
  const [first] = await db
    .select({ at: min(transactions.initiatedAt) })
    .from(transactions)
    .where(and(saleWhere(sellerId, currency), lte(transactions.initiatedAt, asOf)));
  const txns = (
    await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.sellerId, sellerId), gt(transactions.initiatedAt, from), lte(transactions.initiatedAt, asOf)))
  ).filter((t) => isSale(t, currency));
  const ids = txns.map((t) => t.transactionId);

  const [items, catalogue, tracked, shop, disputeRows] = await Promise.all([
    ids.length ? db.select().from(transactionItems).where(inArray(transactionItems.transactionId, ids)) : [],
    db.select().from(products).where(eq(products.sellerId, sellerId)),
    ids.length ? db.select().from(shipments).where(inArray(shipments.transactionId, ids)) : [],
    ids.length ? db.select().from(shopOrders).where(inArray(shopOrders.captureId, ids)) : [],
    db
      .select({ createdAt: disputes.createdAtPaypal })
      .from(disputes)
      .where(and(eq(disputes.sellerId, sellerId), gt(disputes.createdAtPaypal, from), lte(disputes.createdAtPaypal, asOf))),
  ]);

  const match = productMatcher(catalogue);
  const shopByCapture = new Map(shop.map((o) => [o.captureId, o]));

  const sales: Sale[] = txns.map((t) => {
    const matched = items
      .filter((i) => i.transactionId === t.transactionId)
      .map(match)
      .filter((p) => p !== null);
    const ship = tracked.filter((s) => s.transactionId === t.transactionId);
    return {
      id: t.transactionId,
      at: t.initiatedAt,
      cents: toCents(t.amount),
      // The catalogue wins; a demo-shop order's Orders v2 categories fill in when it doesn't match.
      kind:
        kindOf(matched.map((p) => p.kind)) ??
        kindOf((shopByCapture.get(t.transactionId)?.itemCategories ?? []).map((c) => SHOP_CATEGORY_KIND[c])),
      categories: [...new Set(matched.map((p) => p.category).filter((c): c is string => !!c))],
      hasTracking: ship.some((s) => s.trackingNumber !== null && s.status !== "CANCELLED"),
      completed: ship.some((s) => s.status === "COMPLETED"),
    };
  });

  return { asOf, sales, disputeCreatedAt: disputeRows.map((d) => d.createdAt), firstSaleAt: first?.at ?? null };
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
