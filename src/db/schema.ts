import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Metrics } from "@/lib/metrics/compute";

// Lifecycle of a PayPal write (CLAUDE.md rule 5). `unknown` = we sent it but never got an answer
// (timeout/network): never treat that as failed, retry with the same request_id.
export const actionStatus = pgEnum("action_status", [
  "preview",
  "scheduled",
  "sent",
  "cancelled",
  "failed",
  "unknown",
  "sending", // claimed by one sender; makes a double click one PayPal call
]);

export const actions = pgTable("actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  payload: jsonb("payload"),
  // Stable PayPal-Request-Id for this logical action, reused on every retry.
  requestId: text("request_id").notNull().unique(),
  // The preview the seller approved: exactly what will be sent, in plain words.
  summary: text("summary"),
  status: actionStatus("status").notNull().default("preview"),
  undoUntil: timestamp("undo_until", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  // PayPal's FIRST response is the record. A replay with the same request ID is not guaranteed to
  // return it (day-1 test 2), so these columns are written once and never overwritten.
  paypalHttpStatus: integer("paypal_http_status"),
  paypalDebugId: text("paypal_debug_id"),
  paypalResponse: jsonb("paypal_response"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Only signature-verified events are stored.
export const webhookEvents = pgTable("webhook_events", {
  // PayPal's event ID; the primary key is what makes duplicate deliveries a no-op.
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  resourceType: text("resource_type"),
  transmissionId: text("transmission_id").notNull(),
  verifyDebugId: text("verify_debug_id"),
  body: jsonb("body").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

// ---- Sync (Tue 3 Nov) -------------------------------------------------------------------------
// Single seller for the MVP (their own sandbox keys), but every row carries seller_id so metrics and
// alerts are already per seller.

export const productKind = pgEnum("product_kind", ["physical", "digital", "service"]);

// The seller's catalogue: where a product's category and physical/digital kind come from. PayPal's
// Transaction Search carries neither.
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: text("seller_id").notNull(),
    sku: text("sku"),
    name: text("name").notNull(),
    category: text("category"),
    kind: productKind("kind"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("products_seller_sku").on(t.sellerId, t.sku), uniqueIndex("products_seller_name").on(t.sellerId, t.name)],
);

// One row per PayPal transaction from Transaction Search; upserted by transaction ID.
export const transactions = pgTable(
  "transactions",
  {
    transactionId: text("transaction_id").primaryKey(),
    sellerId: text("seller_id").notNull(),
    eventCode: text("event_code").notNull(),
    status: text("status").notNull(), // S success, P pending, V reversed, D denied
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    currency: text("currency").notNull(),
    // Exact decimal string as PayPal sent it; never a float.
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paypalReferenceId: text("paypal_reference_id"),
    raw: jsonb("raw").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    // Last time PayPal's trackers for this transaction were read (tracking read-back).
    trackersCheckedAt: timestamp("trackers_checked_at", { withTimezone: true }),
  },
  (t) => [index("transactions_seller_time").on(t.sellerId, t.initiatedAt)],
);

export const transactionItems = pgTable(
  "transaction_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.transactionId, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name"),
    sku: text("sku"),
    quantity: integer("quantity"),
    unitAmount: numeric("unit_amount", { precision: 14, scale: 2 }),
  },
  (t) => [uniqueIndex("transaction_items_position").on(t.transactionId, t.position)],
);

export const disputes = pgTable(
  "disputes",
  {
    disputeId: text("dispute_id").primaryKey(),
    sellerId: text("seller_id").notNull(),
    createdAtPaypal: timestamp("created_at_paypal", { withTimezone: true }).notNull(),
    updatedAtPaypal: timestamp("updated_at_paypal", { withTimezone: true }),
    status: text("status").notNull(),
    reason: text("reason"),
    stage: text("stage"),
    currency: text("currency"),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    sellerTransactionIds: jsonb("seller_transaction_ids").$type<string[]>().notNull(),
    raw: jsonb("raw").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("disputes_seller_created").on(t.sellerId, t.createdAtPaypal)],
);

// Tracking known for a transaction: from Standing's own pushes (safe-fix queue) or read from PayPal.
// A digital order counts as "marked Completed" when it has a row with status COMPLETED.
export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: text("seller_id").notNull(),
    transactionId: text("transaction_id").notNull(),
    // PayPal's tracker ID: `<transaction>-<tracking number>`, or `<transaction>-NOTRACKER`.
    trackerId: text("tracker_id").unique(),
    trackingNumber: text("tracking_number"),
    carrier: text("carrier"),
    status: text("status").notNull(),
    source: text("source").notNull(), // "standing_push" | "paypal_read"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shipments_transaction").on(t.transactionId)],
);

export const syncState = pgTable(
  "sync_state",
  {
    sellerId: text("seller_id").notNull(),
    job: text("job").notNull(),
    // Everything initiated/updated before this instant is believed synced.
    syncedThrough: timestamp("synced_through", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastError: text("last_error"),
    lastDebugId: text("last_debug_id"),
  },
  (t) => [primaryKey({ columns: [t.sellerId, t.job] })],
);

// ---- Metrics and alerts (Tue 3 Nov) -----------------------------------------------------------

export const metricsDaily = pgTable(
  "metrics_daily",
  {
    sellerId: text("seller_id").notNull(),
    day: date("day").notNull(), // UTC day of as_of
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    currency: text("currency").notNull(),
    values: jsonb("values").$type<Metrics>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.sellerId, t.day] })],
);

export const alertStatus = pgEnum("alert_status", ["open", "resolved"]);

// At most one open alert per seller and kind: a condition that persists updates its alert instead of
// firing again; when it clears, the alert is resolved.
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: text("seller_id").notNull(),
    kind: text("kind").notNull(),
    status: alertStatus("status").notNull().default("open"),
    severity: text("severity").notNull().default("warning"), // "warning" | "info"
    link: text("link"),
    title: text("title").notNull(),
    message: text("message").notNull(),
    facts: jsonb("facts").notNull(),
    firstFiredAt: timestamp("first_fired_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("alerts_one_open").on(t.sellerId, t.kind).where(sql`${t.status} = 'open'`)],
);

// Orders created through Standing's own demo shop. Orders v2 item categories (PHYSICAL_GOODS /
// DIGITAL_GOODS) are stored at creation time, so physical/digital is known before the catalogue is filled.
export const shopOrders = pgTable("shop_orders", {
  captureId: text("capture_id").primaryKey(), // = the PayPal transaction ID Transaction Search reports
  sellerId: text("seller_id").notNull(),
  orderId: text("order_id").notNull(),
  itemCategories: jsonb("item_categories").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Evidence and packs (Fri 6 Nov) -----------------------------------------------------------

export const evidenceKind = pgEnum("evidence_kind", [
  "txn", // a PayPal payment received
  "delivery", // a tracking number on that payment
  "digital_delivery", // the payment marked Completed (digital/service)
  "invoice", // a supplier invoice the seller added, matched to products sold
  "traffic_source", // where the sales came from, added by the seller
  "sales_summary", // figures computed by Standing for one pack
]);

// The ledger an explanation pack may cite. IDs are stable (EV-TXN-<transaction>, …) so re-syncing updates
// an item instead of adding one, and a pack's citations keep pointing at the same fact.
export const evidenceItems = pgTable(
  "evidence_items",
  {
    sellerId: text("seller_id").notNull(),
    id: text("id").notNull(),
    kind: evidenceKind("kind").notNull(),
    transactionId: text("transaction_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    // One plain sentence of fact, written by code from the data (never by the AI).
    summary: text("summary").notNull(),
    facts: jsonb("facts").$type<Record<string, unknown>>().notNull(),
    source: text("source").notNull(), // "paypal" (synced) | "seller" (added by the seller) | "standing" (computed)
    simulated: boolean("simulated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sellerId, t.id] }), index("evidence_seller_kind").on(t.sellerId, t.kind)],
);

export const packStatus = pgEnum("pack_status", ["draft", "blocked", "ready"]);

// An explanation pack: the seller's case, built before PayPal asks. Holds its own copy of every evidence
// item it cites, so the pack stays true even if the ledger changes later.
export const packs = pgTable("packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerId: text("seller_id").notNull(),
  periodFrom: timestamp("period_from", { withTimezone: true }).notNull(),
  periodTo: timestamp("period_to", { withTimezone: true }).notNull(),
  status: packStatus("status").notNull().default("draft"),
  salesCurve: jsonb("sales_curve").$type<{ day: string; cents: number; orders: number }[]>().notNull(),
  summaryEvidenceId: text("summary_evidence_id").notNull(),
  letter: jsonb("letter").$type<{ paragraphs: { sentences: { text: string; citations: string[] }[] }[] }>(),
  evidence: jsonb("evidence").$type<{ id: string; kind: string; summary: string; simulated: boolean }[]>().notNull(),
  validation: jsonb("validation").$type<{ ok: boolean; problems: { paragraph: number; sentence: number; text: string; problem: string }[] }>(),
  provider: text("provider"),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
