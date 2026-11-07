import { and, eq, gt } from "drizzle-orm";
import type { Db } from "@/db";
import { products, shopOrders, transactionItems, transactions } from "@/db/schema";
import { DAY } from "@/lib/metrics/compute";
import { productMatcher, saleWhere } from "@/lib/metrics/load";

// The seller's catalogue: says whether a product is physical, digital or a service. PayPal's Transaction
// Search doesn't. Plain code only: the seller decides each kind, nothing here guesses it.

export const PRODUCT_KINDS = ["physical", "digital", "service"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export interface ProductInput {
  name?: unknown;
  sku?: unknown;
  kind?: unknown;
  category?: unknown;
}

export class InvalidProduct extends Error {}

function text(value: unknown, label: string, max: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new InvalidProduct(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new InvalidProduct(`${label} can be at most ${max} characters.`);
  return trimmed;
}

const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
};

/**
 * Add a product, or update the one with the same name (ignoring case). A category that differs only in
 * case takes the existing spelling, or "Candles" and "candles" would look like a new product type.
 */
export async function saveProduct(db: Db, sellerId: string, input: ProductInput) {
  const name = text(input.name, "Product name", 200);
  const sku = text(input.sku, "SKU", 100) || null;
  const typedCategory = text(input.category, "Category", 60);
  if (!name) throw new InvalidProduct("Add a product name.");
  if (!PRODUCT_KINDS.includes(input.kind as ProductKind)) throw new InvalidProduct("Choose physical, digital or service.");
  const kind = input.kind as ProductKind;

  const existing = await db.select().from(products).where(eq(products.sellerId, sellerId));
  const same = existing.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
  const skuOwner = sku ? existing.find((p) => p.sku === sku && p.id !== same?.id) : undefined;
  if (skuOwner) throw new InvalidProduct(`That SKU already belongs to "${skuOwner.name}".`);
  const category = existing.find((p) => p.category?.toLowerCase() === typedCategory.toLowerCase())?.category ?? (typedCategory || null);

  try {
    if (same) {
      const [row] = await db.update(products).set({ sku: sku ?? same.sku, kind, category }).where(eq(products.id, same.id)).returning();
      return row;
    }
    const [row] = await db.insert(products).values({ sellerId, name, sku, kind, category }).returning();
    return row;
  } catch (err) {
    // Two saves at once: the database's unique index is the final check.
    if (isUniqueViolation(err)) throw new InvalidProduct("That name or SKU was just saved. Refresh and try again.");
    throw err;
  }
}

/** Removes one of this seller's products. Its orders go back to unclassified; PayPal isn't touched. */
export async function deleteProduct(db: Db, sellerId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const gone = await db.delete(products).where(and(eq(products.id, id), eq(products.sellerId, sellerId))).returning({ id: products.id });
  return gone.length > 0;
}

/** The catalogue, plus what recent orders sold that it doesn't cover yet. */
export async function catalogueView(db: Db, sellerId: string, now = new Date(), currency = "USD") {
  const [catalogue, rows, shop] = await Promise.all([
    db.select().from(products).where(eq(products.sellerId, sellerId)).orderBy(products.name),
    db
      .select({ transactionId: transactions.transactionId, name: transactionItems.name, sku: transactionItems.sku })
      .from(transactions)
      .leftJoin(transactionItems, eq(transactionItems.transactionId, transactions.transactionId))
      .where(and(saleWhere(sellerId, currency), gt(transactions.initiatedAt, new Date(now.getTime() - 90 * DAY)))),
    db.select({ captureId: shopOrders.captureId }).from(shopOrders).where(eq(shopOrders.sellerId, sellerId)),
  ]);
  const match = productMatcher(catalogue);
  const fromShop = new Set(shop.map((o) => o.captureId));

  // Unmatched items, one entry per product (same SKU, or else same name ignoring case).
  const unmatched = new Map<string, { name: string | null; sku: string | null; orders: Set<string> }>();
  const named = new Set<string>();
  const seen = new Set<string>();
  for (const r of rows) {
    seen.add(r.transactionId);
    const name = r.name?.trim() || null;
    const sku = r.sku?.trim() || null;
    if (!name && !sku) continue;
    named.add(r.transactionId);
    if (match({ name, sku })) continue;
    const key = sku ? `sku:${sku}` : `name:${name!.toLowerCase()}`;
    const entry = unmatched.get(key) ?? { name, sku, orders: new Set<string>() };
    entry.orders.add(r.transactionId);
    unmatched.set(key, entry);
  }

  return {
    products: catalogue.map((p) => ({ id: p.id, name: p.name, sku: p.sku, kind: p.kind, category: p.category })),
    unmatched: [...unmatched.values()]
      .map((u) => ({ name: u.name, sku: u.sku, orders: u.orders.size }))
      .sort((a, b) => b.orders - a.orders || (a.name ?? a.sku ?? "").localeCompare(b.name ?? b.sku ?? "")),
    // PayPal sent no product name or SKU, so no catalogue entry can ever match these.
    ordersWithoutProductDetails: [...seen].filter((id) => !named.has(id) && !fromShop.has(id)).length,
    categories: [...new Set(catalogue.map((p) => p.category).filter((c): c is string => !!c))].sort(),
  };
}

export type CatalogueView = Awaited<ReturnType<typeof catalogueView>>;
