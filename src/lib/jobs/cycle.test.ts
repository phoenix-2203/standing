import { beforeAll, expect, it } from "vitest";
import type { Db } from "@/db";
import { syncState } from "@/db/schema";
import { fakePayPal, json, testDb } from "@/test/helpers";
import { runCycle } from "./cycle";

let db: Db;
beforeAll(async () => {
  db = await testDb();
});

it("runs sync → metrics → alerts, and still computes metrics when a sync fails", async () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const pp = fakePayPal((call) => {
    if (call.path.startsWith("/v1/customer/disputes")) return json(503, {}, "dbg-disputes-down");
    return json(200, {
      transaction_details: [
        {
          transaction_info: {
            transaction_id: "TX1",
            transaction_event_code: "T0006",
            transaction_status: "S",
            transaction_initiation_date: "2026-11-03T11:00:00Z",
            transaction_amount: { currency_code: "USD", value: "25.00" },
          },
        },
      ],
      total_pages: 1,
    });
  });

  const report = await runCycle(db, pp.client, "seller-1", now);

  expect(report.sync.map((s) => [s.job, s.ok])).toEqual([
    ["transactions", true],
    ["disputes", false],
  ]);
  expect(report.sync[1].debugId).toBe("dbg-disputes-down");
  expect(report.metrics.spike.last24hCents).toBe(2500);
  expect(report.alerts.fired).toEqual([]); // one sale, no baseline, no catalogue: nothing to alert on
  expect(await db.select().from(syncState)).toHaveLength(2);
});
