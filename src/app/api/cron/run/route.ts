import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db";
import { runCycle } from "@/lib/jobs/cycle";
import { providersFromEnv } from "@/lib/llm/providers";
import { paypalFromEnv } from "@/lib/paypal/client";

// Called every 15 minutes by the scheduler (Render cron) with `Authorization: Bearer $CRON_SECRET`.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (!matches(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const sellerId = process.env.STANDING_SELLER_ID ?? "sandbox-seller";
  const report = await runCycle(getDb(), paypalFromEnv(), sellerId, new Date(), providersFromEnv());
  return Response.json({
    sync: report.sync,
    alerts: {
      fired: report.alerts.fired.map((a) => a.kind),
      ongoing: report.alerts.ongoing.map((a) => a.kind),
      resolved: report.alerts.resolved.map((a) => a.kind),
    },
  });
}

function matches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
