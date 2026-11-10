// npm run cycle — run one sync → metrics → alerts cycle against DATABASE_URL (local development).
// The hosted app runs the same cycle every 15 minutes through POST /api/cron/run.
import { getDb } from "@/db";
import { runCycle } from "@/lib/jobs/cycle";
import { providersFromEnv } from "@/lib/llm/providers";
import { emailConfigFromEnv } from "@/lib/notify/email";
import { paypalFromEnv } from "@/lib/paypal/client";

const sellerId = process.env.STANDING_SELLER_ID ?? "sandbox-seller";
runCycle(getDb(), paypalFromEnv(), sellerId, new Date(), providersFromEnv(), emailConfigFromEnv())
  .then((r) => {
    console.log(JSON.stringify({ sync: r.sync.map((s) => [s.job, s.ok, s.upserted, s.debugId ?? null]), alerts: { fired: r.alerts.fired.map((a) => a.kind), ongoing: r.alerts.ongoing.map((a) => a.kind) }, email: r.email ? { sent: r.email.sent.length, failed: r.email.failed.length, error: r.email.error ?? null } : "off" }));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
