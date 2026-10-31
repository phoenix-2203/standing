import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
