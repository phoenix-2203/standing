// npm run demo:orders -- <tag> [count] [--go]
// Creates the demo seller's launch-day burst as real sandbox card orders (see src/lib/shop/demo.ts).
// Without --go it only prints the plan. Stable request IDs: re-running a tag never doubles the orders.
// Transaction Search can lag ~3 hours, so run it the evening before recording, then `npm run cycle`.
import { getDb } from "@/db";
import { paypalFromEnv } from "@/lib/paypal/client";
import { demoOrderBody, demoOrders } from "@/lib/shop/demo";
import { type OrdersV2Response, recordShopOrder } from "@/lib/shop/orders";

const args = process.argv.slice(2);
const go = args.includes("--go");
const [tag, countArg] = args.filter((a) => a !== "--go");
if (!tag) {
  console.error("Usage: npm run demo:orders -- <tag> [count] [--go]   e.g. npm run demo:orders -- demo-1110 12 --go");
  process.exit(1);
}
const orders = demoOrders(tag, countArg ? Number(countArg) : undefined);
const sellerId = process.env.STANDING_SELLER_ID ?? "sandbox-seller";

async function main() {
  const total = orders.reduce((s, o) => s + Number(o.unitPrice) * o.quantity, 0);
  console.log(`${orders.length} test orders, USD ${total.toFixed(2)} in total, tag ${tag}${go ? "" : " (plan only: add --go to create them)"}`);
  if (!go) {
    for (const o of orders) console.log(`  ${o.ref}  ${o.item.name} (${o.item.category})  USD ${o.unitPrice}`);
    return;
  }
  const paypal = paypalFromEnv();
  const db = getDb();
  for (const o of orders) {
    const r = await paypal.request<OrdersV2Response & { status?: string }>("POST", "/v2/checkout/orders", {
      requestId: o.requestId,
      headers: { Prefer: "return=representation" },
      body: demoOrderBody(o),
    });
    if (r.status >= 300 || !r.body) {
      console.log(`${o.ref}: HTTP ${r.status} (debug ${r.debugId}); stopping`);
      process.exit(1);
    }
    const captures = await recordShopOrder(db, sellerId, r.body);
    console.log(`${o.ref}: order ${r.body.id} ${r.body.status ?? ""} capture ${captures.join(",") || "none"} (debug ${r.debugId})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
