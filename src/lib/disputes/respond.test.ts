import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import {
  disputes,
  evidenceItems,
  transactionItems,
  transactions,
} from "@/db/schema";
import { loadMetricsInput } from "@/lib/metrics/load";
import { testDb } from "@/test/helpers";
import { addSimulatedDispute, disputeResponse, disputeRows } from "./respond";

const SELLER = "seller-1";
const NOW = new Date("2026-11-10T10:00:00Z");
let db: Db;

async function payment(id: string, item: string) {
  await db.insert(transactions).values({
    transactionId: id,
    sellerId: SELLER,
    initiatedAt: new Date("2026-11-09T19:30:00Z"),
    eventCode: "T0006",
    status: "S",
    currency: "USD",
    amount: "18.00",
    raw: { transaction_info: { transaction_id: id } },
  } as never);
  await db
    .insert(transactionItems)
    .values({ transactionId: id, position: 0, name: item, sku: null } as never);
}
async function ev(
  id: string,
  kind: string,
  transactionId: string | null,
  summary: string,
  facts: Record<string, unknown> = {},
  source = "paypal",
) {
  await db
    .insert(evidenceItems)
    .values({
      sellerId: SELLER,
      id,
      kind: kind as never,
      transactionId,
      occurredAt: NOW,
      summary,
      facts,
      source,
    });
}
async function dispute(
  id: string,
  reason: string,
  txn: string,
  sellerId = SELLER,
) {
  await db
    .insert(disputes)
    .values({
      disputeId: id,
      sellerId,
      createdAtPaypal: NOW,
      status: "OPEN",
      reason,
      stage: "INQUIRY",
      currency: "USD",
      amount: "18.00",
      sellerTransactionIds: [txn],
      raw: {},
    });
}

beforeEach(async () => {
  db = await testDb();
  await payment("TXN1", "Lavender soy candle");
  await payment("TXN2", "Cedar soy candle");
});

describe("disputeResponse", () => {
  it("gathers only the disputed payment's evidence, plus invoices listing what was sold", async () => {
    await ev(
      "EV-TXN-TXN1",
      "txn",
      "TXN1",
      "PayPal payment TXN1 of USD 18.00 received on 2026-11-09.",
    );
    await ev(
      "EV-TRK-TXN1-9400",
      "delivery",
      "TXN1",
      "Tracking number 9400 (USPS) is on PayPal payment TXN1, status SHIPPED.",
    );
    await ev(
      "EV-TXN-TXN2",
      "txn",
      "TXN2",
      "PayPal payment TXN2 of USD 18.00 received on 2026-11-09.",
    );
    await ev(
      "EV-INV-WAX",
      "invoice",
      null,
      "Supplier invoice WW-2041 from Wax & Wick.",
      { lines: [{ description: "lavender  soy candle", quantity: 40 }] },
      "seller",
    );
    await ev(
      "EV-INV-OTHER",
      "invoice",
      null,
      "Supplier invoice X-1 from Mugs Co.",
      { lines: [{ description: "Mug", quantity: 5 }] },
      "seller",
    );
    await dispute("PP-D-1", "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "TXN1");

    const r = (await disputeResponse(db, SELLER, "PP-D-1"))!;
    expect(r.evidence.map((e) => e.id)).toEqual([
      "EV-TXN-TXN1",
      "EV-TRK-TXN1-9400",
      "EV-INV-WAX",
    ]);
    expect(r.missing).toBeNull();
    expect(r.draft).toContain(
      "Dispute PP-D-1: buyer says the item didn't arrive.",
    );
    expect(r.draft).toContain(
      "2. Tracking number 9400 (USPS) is on PayPal payment TXN1, status SHIPPED.",
    );
    expect(r.draft).not.toContain("TXN2 of");
    expect(r.blanks).toEqual([
      "[ANYTHING ELSE THE BUYER OR PAYPAL SHOULD KNOW, IN YOUR OWN WORDS]",
      "[YOUR NAME]",
    ]);
  });

  it("says what's missing for the reason, with where to fix it", async () => {
    await ev("EV-TXN-TXN1", "txn", "TXN1", "PayPal payment TXN1.");
    await dispute("PP-D-2", "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "TXN1");
    const r = (await disputeResponse(db, SELLER, "PP-D-2"))!;
    expect(r.missing).toMatchObject({ href: "/dashboard#tracking" });
    await dispute("PP-D-3", "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", "TXN2");
    expect(
      (await disputeResponse(db, SELLER, "PP-D-3"))!.missing,
    ).toMatchObject({ href: "/evidence" });
  });

  it("never claims an outcome, and returns nothing for another seller's dispute", async () => {
    await dispute("PP-D-4", "UNAUTHORISED", "TXN1");
    const r = (await disputeResponse(db, SELLER, "PP-D-4"))!;
    expect(r.draft).not.toMatch(
      /will (win|be resolved|be closed|refund)|guarantee|release/i,
    );
    await dispute("PP-D-5", "OTHER", "TXN1", "someone-else");
    expect(await disputeResponse(db, SELLER, "PP-D-5")).toBeNull();
    expect(await disputeResponse(db, SELLER, "nope")).toBeNull();
  });
});

describe("simulated demo disputes", () => {
  it("are labelled Simulated, listed, and never count toward the dispute rate", async () => {
    const id = await addSimulatedDispute(db, SELLER, "TXN1", "18.00", NOW);
    expect(id).toBe("SIM-PP-D-TXN1");
    await dispute("PP-D-REAL", "OTHER", "TXN2");
    const rows = await disputeRows(db, SELLER);
    expect(rows.map((r) => [r.disputeId, r.simulated])).toEqual(
      expect.arrayContaining([
        ["SIM-PP-D-TXN1", true],
        ["PP-D-REAL", false],
      ]),
    );
    const m = await loadMetricsInput(
      db,
      SELLER,
      new Date(NOW.getTime() + 1000),
    );
    expect(m.disputeCreatedAt).toHaveLength(1);
  });

  it("adding the same one twice keeps one row", async () => {
    await addSimulatedDispute(db, SELLER, "TXN1", "18.00", NOW);
    await addSimulatedDispute(db, SELLER, "TXN1", "18.00", NOW);
    expect(await disputeRows(db, SELLER)).toHaveLength(1);
  });
});
