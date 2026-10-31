import type { Db } from "@/db";
import { shopOrders } from "@/db/schema";

// The parts of an Orders v2 create/capture response (Prefer: return=representation) this needs.
export interface OrdersV2Response {
  id: string;
  purchase_units?: {
    items?: { category?: string }[];
    payments?: { captures?: { id: string }[] };
  }[];
}

/**
 * Record a demo-shop order at creation time, keyed by capture ID (= the transaction ID that Transaction
 * Search later reports), with its Orders v2 item categories. Returns the capture IDs recorded.
 */
export async function recordShopOrder(db: Db, sellerId: string, order: OrdersV2Response): Promise<string[]> {
  const recorded: string[] = [];
  for (const unit of order.purchase_units ?? []) {
    const itemCategories = [...new Set((unit.items ?? []).flatMap((i) => (i.category ? [i.category] : [])))];
    for (const capture of unit.payments?.captures ?? []) {
      await db
        .insert(shopOrders)
        .values({ captureId: capture.id, sellerId, orderId: order.id, itemCategories })
        .onConflictDoUpdate({ target: shopOrders.captureId, set: { itemCategories } });
      recorded.push(capture.id);
    }
  }
  return recorded;
}
