import { expect, it } from "vitest";
import { transactions } from "@/db/schema";
import { paypalFromEnv } from "@/lib/paypal/client";
import { testDb } from "@/test/helpers";
import { runCycle } from "./cycle";

// Live sandbox run into a throwaway in-memory database. Prints counts, IDs and metric values only.
it("runs one real cycle against the PayPal sandbox", async () => {
  const db = await testDb();
  const report = await runCycle(db, paypalFromEnv(), "sandbox-seller");
  const rows = await db.select({ id: transactions.transactionId, code: transactions.eventCode, amount: transactions.amount, at: transactions.initiatedAt }).from(transactions);

  console.log(JSON.stringify({ sync: report.sync, transactions: rows.length, sample: rows.slice(0, 5) }, null, 1));
  console.log(JSON.stringify({ spike: report.metrics.spike, avgTicket: report.metrics.avgTicket, dispute90d: report.metrics.disputeRate90d }));
  console.log(JSON.stringify({ fired: report.alerts.fired.map((a) => [a.kind, a.message]) }));
  expect(report.sync.every((s) => s.ok)).toBe(true);
});
