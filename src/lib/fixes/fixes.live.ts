import { expect, it } from "vitest";
import { approveAction } from "@/lib/paypal/actions";
import { paypalFromEnv } from "@/lib/paypal/client";
import { type OrdersV2Response, recordShopOrder } from "@/lib/shop/orders";
import { testDb } from "@/test/helpers";
import { markCompleted, previewFix, sendFix, trackingPush } from "./fixes";

// Live sandbox run of both safe fixes (npm run test:live). Throwaway PGlite DB; prints IDs only.
// The tracking number is a labelled test value, not a real shipment.

const SELLER = "sandbox-seller";
const WINDOW_MS = 3_000; // short cancel window for the live run; the app default is 2 minutes
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

it("tracking push via Orders v2 /track: preview → window → two concurrent sends → one PayPal call", async () => {
  const db = await testDb();
  const paypal = paypalFromEnv();
  // Day-1 order 2: captured 31 Oct, no tracker (read-back 31 Oct, debug f539345a5a445).
  const spec = trackingPush({ sellerId: SELLER, orderId: "82T98686KK690340N", captureId: "7X271304DH7155231", trackingNumber: "STANDINGD5PHY02", carrier: "USPS" });
  const preview = await previewFix(db, spec);
  console.log("preview:", preview.summary);
  const approved = await approveAction(db, spec.requestId, new Date(), WINDOW_MS);
  await sleep(WINDOW_MS + 200);

  const [a, b] = await Promise.all([sendFix(db, paypal, SELLER, spec.requestId), sendFix(db, paypal, SELLER, spec.requestId)]);
  const sent = a.outcome === "sent" ? a : b;
  console.log(JSON.stringify({ requestId: spec.requestId, undoUntil: approved.undoUntil, outcomes: [a.outcome, b.outcome], http: sent.action.paypalHttpStatus, debugId: sent.action.paypalDebugId, attempts: sent.action.attempts }));
  expect([a.outcome, b.outcome].sort()).toEqual(["in_flight", "sent"]);
  expect(sent.action.attempts).toBe(1);

  const back = await paypal.request<{ trackers?: { tracking_number?: string; status: string }[] }>("GET", "/v1/shipping/trackers?transaction_id=7X271304DH7155231");
  console.log("read-back:", back.status, back.debugId, JSON.stringify(back.body?.trackers?.map((t) => [t.tracking_number, t.status])));
  expect(back.body?.trackers?.some((t) => t.tracking_number === "STANDINGD5PHY02")).toBe(true);
});

it("digital 'marks the order Completed' via POST /v1/shipping/trackers", async () => {
  const db = await testDb();
  const paypal = paypalFromEnv();

  // A new demo-shop digital order (card test payment), created with a stable request ID.
  const order = await paypal.request<OrdersV2Response & { status: string }>("POST", "/v2/checkout/orders", {
    requestId: "standing-d5-dig-01-create",
    headers: { Prefer: "return=representation" },
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "d5-dig-01",
          amount: { currency_code: "USD", value: "12.00", breakdown: { item_total: { currency_code: "USD", value: "12.00" } } },
          items: [{ name: "Candle pattern PDF", quantity: "1", category: "DIGITAL_GOODS", unit_amount: { currency_code: "USD", value: "12.00" } }],
        },
      ],
      payment_source: {
        card: {
          number: "4111111111111111",
          expiry: "2030-12",
          security_code: "123",
          name: "Test Buyer",
          billing_address: { address_line_1: "1 Main St", admin_area_2: "San Jose", admin_area_1: "CA", postal_code: "95131", country_code: "US" },
        },
      },
    },
  });
  console.log("order:", order.status, order.debugId, order.body?.id, order.body?.status);
  expect(order.status).toBe(201);
  const [captureId] = await recordShopOrder(db, SELLER, order.body!);

  const spec = markCompleted({ sellerId: SELLER, captureId });
  console.log("preview:", (await previewFix(db, spec)).summary);
  await approveAction(db, spec.requestId, new Date(), WINDOW_MS);
  await sleep(WINDOW_MS + 200);
  const r = await sendFix(db, paypal, SELLER, spec.requestId);
  console.log(JSON.stringify({ requestId: spec.requestId, outcome: r.outcome, http: r.action.paypalHttpStatus, debugId: r.action.paypalDebugId }));
  expect(r.outcome).toBe("sent");

  const back = await paypal.request<{ trackers?: { status: string }[] }>("GET", `/v1/shipping/trackers?transaction_id=${captureId}`);
  console.log("read-back:", back.status, back.debugId, JSON.stringify(back.body?.trackers?.map((t) => t.status)));
  expect(back.body?.trackers?.some((t) => t.status === "COMPLETED")).toBe(true);
});

// No order ID, as for any order that didn't come through the demo shop: the route the dashboard button uses.
// Day-1 captures with no tracker; labelled test numbers. Each carrier code the UI offers is tried once.
it.each([
  ["0KA603561R998142L", "USPS", "STANDINGD7USPS"],
  ["0MR493725R555252N", "UPS", "STANDINGD7UPS"],
  ["0V070374TB2731508", "FEDEX", "STANDINGD7FEDEX"],
  ["1PM458967T448544K", "DHL", "STANDINGD7DHL"],
  ["1WP49974J7411162H", "OTHER", "STANDINGD7OTHER"],
])("tracking by transaction ID via POST /v1/shipping/trackers: %s %s", async (captureId, carrier, trackingNumber) => {
  const db = await testDb();
  const paypal = paypalFromEnv();
  const spec = trackingPush({ sellerId: SELLER, captureId, trackingNumber, carrier, carrierNameOther: carrier === "OTHER" ? "GIG Logistics" : undefined });
  await previewFix(db, spec);
  await approveAction(db, spec.requestId, new Date(), WINDOW_MS);
  await sleep(WINDOW_MS + 200);
  const r = await sendFix(db, paypal, SELLER, spec.requestId);
  console.log(JSON.stringify({ carrier, requestId: spec.requestId, outcome: r.outcome, http: r.action.paypalHttpStatus, debugId: r.action.paypalDebugId, response: r.outcome === "failed" ? r.action.paypalResponse : undefined }));
  const back = await paypal.request<{ trackers?: { tracking_number?: string; carrier?: string; status: string }[] }>("GET", `/v1/shipping/trackers?transaction_id=${captureId}`);
  console.log("read-back:", back.status, back.debugId, JSON.stringify(back.body?.trackers?.map((t) => [t.tracking_number, t.carrier, t.status])));
  expect(r.outcome).toBe("sent");
  expect(back.body?.trackers?.some((t) => t.tracking_number === trackingNumber)).toBe(true);
}, 30_000);

// What PayPal does when the Completed call is replayed: a tracker from an earlier run, same request ID.
it("Completed replayed on an order already Completed settles as sent, from the read-back", async () => {
  const db = await testDb();
  const paypal = paypalFromEnv();
  const spec = markCompleted({ sellerId: SELLER, captureId: "5VE587515T743130S" });
  await previewFix(db, spec);
  await approveAction(db, spec.requestId, new Date(), WINDOW_MS);
  await sleep(WINDOW_MS + 200);
  const r = await sendFix(db, paypal, SELLER, spec.requestId);
  console.log(JSON.stringify({ requestId: spec.requestId, outcome: r.outcome, status: r.action.status, http: r.action.paypalHttpStatus, debugId: r.action.paypalDebugId, response: r.action.paypalResponse }));
  expect(r.outcome).toBe("sent");
}, 30_000);
