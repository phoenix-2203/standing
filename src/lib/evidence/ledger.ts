import { createHash } from "node:crypto";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { Db } from "@/db";
import { evidenceItems, products, shipments, transactionItems, transactions } from "@/db/schema";
import { saleWhere } from "@/lib/metrics/load";

// Evidence ledger (BLUEPRINT §2.5): each synced order adds evidence the explanation pack may cite.
// Every summary is written here, by code, from stored data (CLAUDE.md rules 3 and 6). Seller-added
// invoices and traffic sources are data, never instructions; simulated inputs say so in their summary.

export type Evidence = typeof evidenceItems.$inferSelect;

/** The seller's input is invalid; the message is safe to show them. */
export class InvalidEvidence extends Error {}

const MAX_INVOICE_LINES = 50;
const isText = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
type NewEvidence = typeof evidenceItems.$inferInsert;

const day = (d: Date) => d.toISOString().slice(0, 10);
const money = (value: string, currency: string) => `${currency} ${value}`;
const shortHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 10).toUpperCase();
const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Rebuild the PayPal-sourced part of the ledger from synced sales and trackers. Idempotent. */
export async function syncLedger(db: Db, sellerId: string, currency = "USD", now = new Date()): Promise<{ upserted: number; removed: number }> {
  const sales = await db.select().from(transactions).where(saleWhere(sellerId, currency));
  const ids = sales.map((s) => s.transactionId);
  const tracked = ids.length ? await db.select().from(shipments).where(inArray(shipments.transactionId, ids)) : [];

  const items: NewEvidence[] = [];
  for (const s of sales) {
    items.push({
      sellerId,
      id: `EV-TXN-${s.transactionId}`,
      kind: "txn",
      transactionId: s.transactionId,
      occurredAt: s.initiatedAt,
      summary: `PayPal payment ${s.transactionId} of ${money(s.amount, s.currency)} received on ${day(s.initiatedAt)}.`,
      facts: { transactionId: s.transactionId, amount: s.amount, currency: s.currency, date: day(s.initiatedAt), status: s.status, eventCode: s.eventCode },
      source: "paypal",
    });
  }
  for (const t of tracked) {
    if (t.status === "COMPLETED") {
      items.push({
        sellerId,
        id: `EV-DIG-${t.transactionId}`,
        kind: "digital_delivery",
        transactionId: t.transactionId,
        occurredAt: t.createdAt,
        summary: `PayPal payment ${t.transactionId} is marked Completed in PayPal (digital delivery).`,
        facts: { transactionId: t.transactionId, status: "COMPLETED", trackerId: t.trackerId },
        source: "paypal",
      });
    } else if (t.trackingNumber && t.status !== "CANCELLED") {
      items.push({
        sellerId,
        id: `EV-TRK-${t.transactionId}-${t.trackingNumber}`,
        kind: "delivery",
        transactionId: t.transactionId,
        occurredAt: t.createdAt,
        summary: `Tracking number ${t.trackingNumber} (${t.carrier ?? "carrier not given"}) is on PayPal payment ${t.transactionId}, status ${t.status}.`,
        facts: { transactionId: t.transactionId, trackingNumber: t.trackingNumber, carrier: t.carrier, status: t.status },
        source: "paypal",
      });
    }
  }

  for (const item of items) {
    await db
      .insert(evidenceItems)
      .values({ ...item, updatedAt: now })
      .onConflictDoUpdate({ target: [evidenceItems.sellerId, evidenceItems.id], set: { summary: item.summary, facts: item.facts, kind: item.kind, updatedAt: now } });
  }
  // PayPal-sourced evidence that no longer holds (e.g. a tracker was cancelled) leaves the ledger.
  // Packs keep their own copy of what they cited.
  const keep = items.map((i) => i.id);
  const removed = await db
    .delete(evidenceItems)
    .where(and(eq(evidenceItems.sellerId, sellerId), eq(evidenceItems.source, "paypal"), keep.length ? notInArray(evidenceItems.id, keep) : undefined))
    .returning({ id: evidenceItems.id });
  return { upserted: items.length, removed: removed.length };
}

export interface InvoiceInput {
  supplier: string;
  invoiceNumber: string;
  date: string; // YYYY-MM-DD
  lines: { description: string; quantity: number }[];
  simulated?: boolean;
}

/** A supplier invoice the seller adds, matched (by exact product name or SKU) to products they sold. */
export async function addInvoice(db: Db, sellerId: string, inv: InvoiceInput, now = new Date()): Promise<Evidence> {
  if (!isText(inv.supplier, 120) || !isText(inv.invoiceNumber, 60)) throw new InvalidEvidence("Invoice needs a supplier and an invoice number");
  if (!validDate(inv.date) || inv.date > day(now)) throw new InvalidEvidence("Invoice date must be YYYY-MM-DD, not in the future");
  if (!Array.isArray(inv.lines) || !inv.lines.length || inv.lines.length > MAX_INVOICE_LINES || inv.lines.some((l) => !isText(l?.description, 200) || !Number.isInteger(l.quantity) || l.quantity <= 0 || l.quantity > 1_000_000)) {
    throw new InvalidEvidence(`Invoice lines (1 to ${MAX_INVOICE_LINES}) need a description and a whole positive quantity`);
  }
  if (inv.simulated !== undefined && typeof inv.simulated !== "boolean") throw new InvalidEvidence("simulated must be true or false");

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const catalogue = await db.select().from(products).where(eq(products.sellerId, sellerId));
  const soldItems = await db
    .select({ name: transactionItems.name, sku: transactionItems.sku, transactionId: transactionItems.transactionId })
    .from(transactionItems)
    .innerJoin(transactions, eq(transactions.transactionId, transactionItems.transactionId))
    .where(eq(transactions.sellerId, sellerId));

  const matched = new Map<string, Set<string>>(); // invoice line → orders that sold it
  for (const line of inv.lines) {
    const d = norm(line.description);
    const product = catalogue.find((p) => norm(p.name) === d || (p.sku && norm(p.sku) === d));
    const names = new Set([d, ...(product ? [norm(product.name)] : [])]);
    const skus = new Set(product?.sku ? [norm(product.sku)] : []);
    const orders = soldItems.filter((i) => (i.name && names.has(norm(i.name))) || (i.sku && skus.has(norm(i.sku)))).map((i) => i.transactionId);
    if (product || orders.length) matched.set(line.description.trim(), new Set(orders));
  }
  const orderCount = new Set([...matched.values()].flatMap((s) => [...s])).size;
  const matchedNames = [...matched.keys()];

  const item: NewEvidence = {
    sellerId,
    id: `EV-INV-${slug(inv.supplier)}-${slug(inv.invoiceNumber)}`,
    kind: "invoice",
    occurredAt: new Date(`${inv.date}T00:00:00Z`),
    summary:
      `${inv.simulated ? "Simulated: " : ""}Supplier invoice ${inv.invoiceNumber.trim()} from ${inv.supplier.trim()} dated ${inv.date} ` +
      `lists ${inv.lines.length} line${inv.lines.length === 1 ? "" : "s"}; ` +
      (matchedNames.length ? `${matchedNames.length} ${matchedNames.length === 1 ? "matches a product" : "match products"} sold (${matchedNames.join(", ")}) in ${orderCount} order${orderCount === 1 ? "" : "s"}.` : "none match products sold yet."),
    facts: {
      supplier: inv.supplier.trim(),
      invoiceNumber: inv.invoiceNumber.trim(),
      date: inv.date,
      lines: inv.lines,
      matchedProducts: matchedNames,
      matchedOrders: orderCount,
    },
    source: "seller",
    simulated: inv.simulated ?? false,
  };
  return upsert(db, item, now);
}

export interface TrafficSourceInput {
  label: string; // e.g. "TikTok video: pouring the lavender candle"
  url: string;
  date: string; // YYYY-MM-DD the traffic started
  simulated?: boolean;
}

/** Where a sales spike came from, as the seller tells it (a video, a post, a newsletter). */
export async function addTrafficSource(db: Db, sellerId: string, src: TrafficSourceInput, now = new Date()): Promise<Evidence> {
  let url: URL;
  try {
    url = new URL(String(src.url));
  } catch {
    throw new InvalidEvidence("Traffic source needs a valid URL");
  }
  if (url.protocol !== "https:") throw new InvalidEvidence("Traffic source URL must be https");
  if (url.href.length > 500) throw new InvalidEvidence("Traffic source URL is too long");
  if (!isText(src.label, 120)) throw new InvalidEvidence("Traffic source needs a short label");
  if (!validDate(src.date) || src.date > day(now)) throw new InvalidEvidence("Traffic source date must be YYYY-MM-DD, not in the future");
  if (src.simulated !== undefined && typeof src.simulated !== "boolean") throw new InvalidEvidence("simulated must be true or false");
  return upsert(
    db,
    {
      sellerId,
      id: `EV-SRC-${shortHash(url.href)}`,
      kind: "traffic_source",
      occurredAt: new Date(`${src.date}T00:00:00Z`),
      summary: `${src.simulated ? "Simulated: " : ""}Traffic source added by the seller: ${src.label.trim()} (${url.href}), from ${src.date}.`,
      facts: { label: src.label.trim(), url: url.href, date: src.date },
      source: "seller",
      simulated: src.simulated ?? false,
    },
    now,
  );
}

function validDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
}

/** What the seller added themselves (invoices, traffic sources, delivery proof), newest first. */
export async function sellerEvidence(db: Db, sellerId: string): Promise<Evidence[]> {
  const rows = await db.select().from(evidenceItems).where(and(eq(evidenceItems.sellerId, sellerId), eq(evidenceItems.source, "seller")));
  return rows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}

/**
 * Remove one item the seller added. PayPal-sourced evidence can't be removed here (the sync owns it), and
 * packs already built keep their own copy of what they cited. Returns false if there was nothing to remove.
 */
export async function removeSellerEvidence(db: Db, sellerId: string, id: string): Promise<boolean> {
  const gone = await db
    .delete(evidenceItems)
    .where(and(eq(evidenceItems.sellerId, sellerId), eq(evidenceItems.id, id), eq(evidenceItems.source, "seller")))
    .returning({ id: evidenceItems.id });
  return gone.length > 0;
}

async function upsert(db: Db, item: NewEvidence, now: Date): Promise<Evidence> {
  const [row] = await db
    .insert(evidenceItems)
    .values({ ...item, updatedAt: now })
    .onConflictDoUpdate({
      target: [evidenceItems.sellerId, evidenceItems.id],
      set: { summary: item.summary, facts: item.facts, occurredAt: item.occurredAt, simulated: item.simulated, updatedAt: now },
    })
    .returning();
  return row;
}
