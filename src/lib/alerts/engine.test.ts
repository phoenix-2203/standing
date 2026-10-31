import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { alerts, metricsDaily, products, transactionItems, transactions } from "@/db/schema";
import { computeMetrics } from "@/lib/metrics/compute";
import { runMetrics } from "@/lib/metrics/load";
import { upsertTransaction } from "@/lib/sync/transactions";
import { testDb } from "@/test/helpers";
import { AS_OF, sale, steady } from "@/test/seed";
import { applyAlerts } from "./engine";

const SELLER = "seller-1";
const HOUR = 3_600_000;

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  for (const t of [alerts, metricsDaily, transactionItems, transactions, products]) await db.delete(t);
});

const metricsFor = (sales: ReturnType<typeof steady>, asOf = AS_OF) => computeMetrics({ asOf, sales, disputeCreatedAt: [] });
const spiking = () => metricsFor([...steady(28, 1, 2, 20), ...steady(0, 0, 6, 20)]);
const quiet = () => metricsFor(steady(28, 1, 2, 20));

describe("applyAlerts", () => {
  it("opens an alert the first time a condition is true", async () => {
    const run = await applyAlerts(db, SELLER, spiking(), AS_OF);
    expect(run.fired.map((a) => a.kind)).toEqual(["spike"]);
    expect(run.fired[0]).toMatchObject({ status: "open", title: "Sales spike", firstFiredAt: AS_OF });
  });

  it("doesn't fire again while the condition persists; it updates the open alert", async () => {
    await applyAlerts(db, SELLER, spiking(), AS_OF);
    const later = new Date(AS_OF.getTime() + HOUR);
    const run = await applyAlerts(db, SELLER, spiking(), later);
    expect(run.fired).toEqual([]);
    expect(run.ongoing).toHaveLength(1);
    expect(run.ongoing[0]).toMatchObject({ firstFiredAt: AS_OF, lastSeenAt: later });
    expect(await db.select().from(alerts)).toHaveLength(1);
  });

  it("resolves when the condition clears, and fires anew if it comes back", async () => {
    await applyAlerts(db, SELLER, spiking(), AS_OF);
    const cleared = await applyAlerts(db, SELLER, quiet(), new Date(AS_OF.getTime() + HOUR));
    expect(cleared.resolved).toHaveLength(1);
    expect(cleared.resolved[0]).toMatchObject({ status: "resolved", kind: "spike" });

    const again = await applyAlerts(db, SELLER, spiking(), new Date(AS_OF.getTime() + 2 * HOUR));
    expect(again.fired).toHaveLength(1);
    expect(await db.select().from(alerts)).toHaveLength(2);
  });

  it("keeps sellers apart", async () => {
    await applyAlerts(db, SELLER, spiking(), AS_OF);
    const other = await applyAlerts(db, "seller-2", spiking(), AS_OF);
    expect(other.fired).toHaveLength(1);
  });

  it("two concurrent runs open only one alert", async () => {
    const [a, b] = await Promise.all([applyAlerts(db, SELLER, spiking(), AS_OF), applyAlerts(db, SELLER, spiking(), AS_OF)]);
    expect(a.fired.length + b.fired.length).toBe(1);
    expect(await db.select().from(alerts)).toHaveLength(1);
  });
});

it("end to end: seeded transactions → metrics → spike alert fires (BLUEPRINT Tue 3 Nov 'done when')", async () => {
  // 28 days of 2 × $20 a day, then 8 × $20 in the last 24 h (4×), stored as PayPal Transaction Search rows.
  const seeded = [...steady(28, 1, 2, 20), ...steady(0, 0, 8, 20)];
  for (const s of seeded) {
    await upsertTransaction(db, SELLER, {
      transaction_info: {
        transaction_id: s.id,
        transaction_event_code: "T0006",
        transaction_status: "S",
        transaction_initiation_date: s.at.toISOString(),
        transaction_amount: { currency_code: "USD", value: (s.cents / 100).toFixed(2) },
      },
    });
  }
  // A refund in the last 24 h must not count toward the spike.
  const refund = sale(1, -20);
  await upsertTransaction(db, SELLER, {
    transaction_info: {
      transaction_id: "REFUND-1",
      transaction_event_code: "T1107",
      transaction_status: "S",
      transaction_initiation_date: refund.at.toISOString(),
      transaction_amount: { currency_code: "USD", value: "-20.00" },
    },
  });

  const metrics = await runMetrics(db, SELLER, AS_OF);
  expect(metrics.spike).toEqual({ last24hCents: 16000, baselineDailyMeanCents: 4000, ratio: 4 });

  const run = await applyAlerts(db, SELLER, metrics, AS_OF);
  expect(run.fired.map((a) => a.kind)).toContain("spike");
  expect(run.fired.find((a) => a.kind === "spike")!.message).toContain("are 4.0× your average day");
});
