import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import {
  actions,
  alerts,
  demoWorkspaces,
  disputes,
  evidenceItems,
  paypalConnections,
  shipments,
  shopOrders,
  transactionItems,
  transactions,
} from "@/db/schema";
import { addInvoice } from "@/lib/evidence/ledger";
import { addSimulatedDispute } from "@/lib/disputes/respond";
import { sendFix } from "@/lib/fixes/fixes";
import { addTracking } from "@/lib/fixes/tracking";
import { testDb } from "@/test/helpers";
import {
  createDemoWorkspace,
  isDemoSeller,
  LIMITS,
  purgeDemoWorkspaces,
  SIMULATED_DEBUG_ID,
  simulatedPayPal,
  spendAllowance,
} from "./workspace";

const SRC = "sandbox-seller";
const NOW = new Date("2026-11-12T12:00:00Z");
let db: Db;

async function sale(
  id: string,
  hoursBefore: Date,
  h: number,
  item: string,
  cat: string,
) {
  await db
    .insert(transactions)
    .values({
      transactionId: id,
      sellerId: SRC,
      initiatedAt: new Date(hoursBefore.getTime() - h * 3600e3),
      eventCode: "T0006",
      status: "S",
      currency: "USD",
      amount: "20.00",
      raw: { transaction_info: { transaction_id: id } },
    } as never);
  await db
    .insert(transactionItems)
    .values({ transactionId: id, position: 0, name: item, sku: null } as never);
  await db
    .insert(shopOrders)
    .values({
      captureId: id,
      sellerId: SRC,
      orderId: `O${id}`,
      itemCategories: [cat],
    });
}

beforeEach(async () => {
  db = await testDb();
  const last = new Date("2026-11-09T20:30:00Z");
  for (let i = 1; i <= 6; i++)
    await sale(
      `HIST${i}`,
      last,
      24 * 3 * i,
      "Cedar soy candle",
      "PHYSICAL_GOODS",
    );
  await sale(
    "4KC9537438951691U",
    last,
    60,
    "Lavender soy candle",
    "PHYSICAL_GOODS",
  );
  await sale(
    "3A2375257R985071S",
    last,
    0,
    "Candle-making pattern PDF",
    "DIGITAL_GOODS",
  );
  await db
    .insert(shipments)
    .values({
      sellerId: SRC,
      transactionId: "HIST1",
      trackerId: "HIST1-9400",
      trackingNumber: "9400",
      carrier: "USPS",
      status: "SHIPPED",
      source: "paypal_read",
    });
  await addInvoice(db, SRC, {
    supplier: "Wax & Wick",
    invoiceNumber: "WW-1",
    date: "2026-11-02",
    lines: [{ description: "Lavender soy candle", quantity: 40 }],
    simulated: true,
  });
  await addSimulatedDispute(db, SRC, "4KC9537438951691U", "20.00", last);
  await db
    .insert(paypalConnections)
    .values({
      sellerId: SRC,
      verification: "verified",
      payerId: "REALPAYER",
      checkedAt: last,
    });
});

describe("createDemoWorkspace", () => {
  it("copies the shop with new IDs, leaving the source untouched", async () => {
    const before = (await db.select().from(transactions)).length;
    const ws = await createDemoWorkspace(db, SRC, NOW);
    expect(isDemoSeller(ws)).toBe(true);
    const mine = await db
      .select()
      .from(transactions)
      .where(eq(transactions.sellerId, ws));
    expect(mine).toHaveLength(8);
    expect(mine.every((t) => /^D[0-9A-F]{8}/.test(t.transactionId))).toBe(true);
    expect((await db.select().from(transactions)).length).toBe(before + 8);
    expect(
      (
        await db
          .select()
          .from(transactions)
          .where(eq(transactions.sellerId, SRC))
      )
        .map((t) => t.transactionId)
        .sort(),
    ).toContain("4KC9537438951691U");
    const copied = mine.find((t) =>
      t.transactionId.endsWith("4KC9537438951691U"),
    )!;
    expect(
      (copied.raw as { transaction_info: { transaction_id: string } })
        .transaction_info.transaction_id,
    ).toBe(copied.transactionId);
    const items = await db
      .select()
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, copied.transactionId));
    expect(items.map((i) => i.name)).toEqual(["Lavender soy candle"]);
  });

  it("moves dates so the newest sale is two hours old", async () => {
    const ws = await createDemoWorkspace(db, SRC, NOW);
    const mine = await db
      .select()
      .from(transactions)
      .where(eq(transactions.sellerId, ws));
    const newest = Math.max(...mine.map((t) => t.initiatedAt.getTime()));
    expect(newest).toBe(NOW.getTime() - 2 * 3600e3);
  });

  it("copies shipments, the seller's evidence and the simulated dispute; rebuilds PayPal evidence; opens alerts; never copies the real payer ID", async () => {
    const ws = await createDemoWorkspace(db, SRC, NOW);
    const ship = await db
      .select()
      .from(shipments)
      .where(eq(shipments.sellerId, ws));
    expect(ship.map((s) => s.trackerId)).toEqual([
      expect.stringMatching(/^D[0-9A-F]{8}HIST1-9400$/),
    ]);
    const ev = await db
      .select()
      .from(evidenceItems)
      .where(eq(evidenceItems.sellerId, ws));
    expect(ev.some((e) => e.kind === "invoice" && e.simulated)).toBe(true);
    expect(ev.filter((e) => e.kind === "txn")).toHaveLength(8);
    expect(ev.every((e) => !e.summary.includes(" 4KC9537438951691U "))).toBe(
      true,
    );
    const ds = await db
      .select()
      .from(disputes)
      .where(eq(disputes.sellerId, ws));
    expect(ds.map((d) => d.disputeId)).toEqual([
      expect.stringMatching(/^SIM-PP-D-D[0-9A-F]{8}4KC9537438951691U$/),
    ]);
    expect(
      (await db.select().from(alerts).where(eq(alerts.sellerId, ws))).length,
    ).toBeGreaterThan(0);
    const [conn] = await db
      .select()
      .from(paypalConnections)
      .where(eq(paypalConnections.sellerId, ws));
    expect(conn).toMatchObject({ verification: "verified", payerId: null });
  });

  it("two testers get separate copies", async () => {
    const a = await createDemoWorkspace(db, SRC, NOW);
    const b = await createDemoWorkspace(db, SRC, NOW);
    expect(a).not.toBe(b);
    const ta = (
      await db.select().from(transactions).where(eq(transactions.sellerId, a))
    ).map((t) => t.transactionId);
    const tb = (
      await db.select().from(transactions).where(eq(transactions.sellerId, b))
    ).map((t) => t.transactionId);
    expect(ta.filter((x) => tb.includes(x))).toEqual([]);
  });
});

describe("simulated sends", () => {
  it("a demo fix goes through the real queue, makes no network call, and stores a SIMULATED answer", async () => {
    const ws = await createDemoWorkspace(db, SRC, NOW);
    const [t] = (
      await db.select().from(transactions).where(eq(transactions.sellerId, ws))
    ).filter((x) => x.transactionId.endsWith("4KC9537438951691U"));
    const queued = await addTracking(
      db,
      ws,
      t.transactionId,
      { trackingNumber: "9400111899562118430953", carrier: "USPS" },
      NOW,
    );
    const later = new Date(NOW.getTime() + 3 * 60_000);
    const r = await sendFix(db, simulatedPayPal(), ws, queued.requestId, later);
    expect(r.outcome).toBe("sent");
    const [a] = await db
      .select()
      .from(actions)
      .where(eq(actions.requestId, queued.requestId));
    expect(
      (
        await db.select().from(shipments).where(eq(shipments.sellerId, ws))
      ).some((x) => x.trackingNumber === "9400111899562118430953"),
    ).toBe(true);
    expect([a.paypalHttpStatus, a.paypalDebugId]).toEqual([
      201,
      SIMULATED_DEBUG_ID,
    ]);
    expect(JSON.stringify(a.paypalResponse)).toContain(
      "nothing was sent to PayPal",
    );
  });
});

describe("allowances and purge", () => {
  it("caps AI uses per demo workspace, never real sellers", async () => {
    const ws = await createDemoWorkspace(db, SRC, NOW);
    for (let i = 0; i < LIMITS.packs; i++)
      expect(await spendAllowance(db, ws, "packs")).toBe(true);
    expect(await spendAllowance(db, ws, "packs")).toBe(false);
    expect(await spendAllowance(db, ws, "asks")).toBe(true);
    expect(await spendAllowance(db, SRC, "packs")).toBe(true);
  });

  it("deletes workspaces older than the limit, with everything they own, and nothing else", async () => {
    const old = await createDemoWorkspace(
      db,
      SRC,
      new Date(NOW.getTime() - 49 * 3600e3),
    );
    const fresh = await createDemoWorkspace(db, SRC, NOW);
    expect(await purgeDemoWorkspaces(db, NOW)).toBe(1);
    expect(
      await db
        .select()
        .from(transactions)
        .where(eq(transactions.sellerId, old)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(evidenceItems)
        .where(eq(evidenceItems.sellerId, old)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(demoWorkspaces)
        .where(eq(demoWorkspaces.sellerId, old)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(transactions)
        .where(eq(transactions.sellerId, fresh)),
    ).toHaveLength(8);
    expect(
      await db
        .select()
        .from(transactions)
        .where(eq(transactions.sellerId, SRC)),
    ).toHaveLength(8);
  });
});
