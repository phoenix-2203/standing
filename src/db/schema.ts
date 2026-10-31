import {
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

// Lifecycle of a PayPal write (CLAUDE.md rule 5). `unknown` = we sent it but never got an answer
// (timeout/network): never treat that as failed, retry with the same request_id.
export const actionStatus = pgEnum("action_status", [
  "preview",
  "scheduled",
  "sent",
  "cancelled",
  "failed",
  "unknown",
]);

export const actions = pgTable("actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  payload: jsonb("payload"),
  // Stable PayPal-Request-Id for this logical action, reused on every retry.
  requestId: text("request_id").notNull().unique(),
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
