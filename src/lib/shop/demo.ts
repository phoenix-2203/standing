// Demo-seller orders for the video (BLUEPRINT "Tue 10: generate the demo spike"). Real sandbox card orders with
// PayPal's test card, so they show up in Transaction Search like any sale, but with item names and
// categories set, because orders without them can't be matched by the catalogue.
// The buyers are a test card, not people: the video and README must call these "test orders".

export interface DemoOrder {
  ref: string;
  requestId: string; // stable PayPal-Request-Id: re-running the same tag never creates a second order
  item: { name: string; sku: string; category: "PHYSICAL_GOODS" | "DIGITAL_GOODS" };
  quantity: number;
  unitPrice: string;
}

const PHYSICAL = [
  { name: "Lavender soy candle", sku: "CND-LAV", price: 18 },
  { name: "Cedar soy candle", sku: "CND-CED", price: 20 },
  { name: "Citrus soy candle", sku: "CND-CIT", price: 22 },
];

/**
 * A launch-day burst: `count` small physical orders, two digital pattern downloads (so the
 * not-marked-Completed check has work) and one large gift-set order (so the average-order signal moves).
 * With `baseline`, only the `count` small physical orders: an ordinary day, run on the days before the
 * burst so the sales curve has a normal level to spike from (sandbox orders can't be backdated).
 * `tag` scopes the request IDs, e.g. "demo-1110"; the same tag always yields the same orders.
 */
export function demoOrders(tag: string, count = 12, { baseline = false } = {}): DemoOrder[] {
  if (!/^[a-z0-9-]{3,24}$/.test(tag)) throw new Error("tag must be 3-24 lowercase letters, digits or dashes");
  if (!Number.isInteger(count) || count < 1 || count > 40) throw new Error("count must be 1 to 40");
  const out: DemoOrder[] = [];
  const add = (ref: string, item: DemoOrder["item"], quantity: number, unitPrice: number) =>
    out.push({ ref: `${tag}-${ref}`, requestId: `standing-${tag}-${ref}-create`, item, quantity, unitPrice: unitPrice.toFixed(2) });
  for (let i = 0; i < count; i++) {
    const p = PHYSICAL[i % PHYSICAL.length];
    add(`phy-${String(i + 1).padStart(2, "0")}`, { name: p.name, sku: p.sku, category: "PHYSICAL_GOODS" }, 1, p.price);
  }
  if (baseline) return out;
  for (let i = 1; i <= 2; i++) add(`dig-${String(i).padStart(2, "0")}`, { name: "Candle-making pattern PDF", sku: "PDF-PATTERN", category: "DIGITAL_GOODS" }, 1, 12);
  add("gift-01", { name: "Candle gift set", sku: "CND-GIFT12", category: "PHYSICAL_GOODS" }, 1, 180);
  return out;
}

/** The Orders v2 create body for one demo order, paid with PayPal's public sandbox test card. */
export function demoOrderBody(o: DemoOrder) {
  const total = (Number(o.unitPrice) * o.quantity).toFixed(2);
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: o.ref,
        amount: { currency_code: "USD", value: total, breakdown: { item_total: { currency_code: "USD", value: total } } },
        items: [{ name: o.item.name, sku: o.item.sku, quantity: String(o.quantity), category: o.item.category, unit_amount: { currency_code: "USD", value: o.unitPrice } }],
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
  };
}
