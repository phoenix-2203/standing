import { and, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { alertEmails, alerts } from "@/db/schema";
import type { Alert } from "@/lib/alerts/engine";

// Email alerts (README roadmap). When a cycle opens new alerts, the seller gets one email listing them, in the same
// words and numbers as the dashboard: written by code from the alert rows, never by the AI. Each alert is emailed
// at most once (alert_emails primary key). A failed send is retried on later cycles, up to MAX_ATTEMPTS.

export const MAX_ATTEMPTS = 3;
/** A "sending" row older than this was interrupted (crash or deploy mid-send) and is treated as failed. */
export const STUCK_MS = 10 * 60_000;

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}
export type SendResult =
  { ok: true; id: string } | { ok: false; error: string };
export type EmailSender = (email: Email) => Promise<SendResult>;

export interface EmailConfig {
  to: string;
  from: string;
  appBaseUrl: string;
  send: EmailSender;
}

/** Resend's HTTP API (resend.com). The free plan sends from onboarding@resend.dev to the account's own address. */
export function resendSender(
  apiKey: string,
  from: string,
  f: typeof fetch = globalThis.fetch,
): EmailSender {
  return async (email) => {
    let res: Response;
    try {
      res = await f("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": email.idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          html: email.html,
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      return { ok: false, error: `request failed (${(err as Error).name})` };
    }
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    if (res.ok && body?.id) return { ok: true, id: body.id };
    return { ok: false, error: `HTTP ${res.status}` };
  };
}

/** Email settings from the environment, or null when email alerts are off (no recipient or no key). */
export function emailConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): EmailConfig | null {
  const to = env.STANDING_ALERT_EMAIL?.trim();
  const key = env.RESEND_API_KEY?.trim();
  if (!to || !key) return null;
  const from =
    env.STANDING_EMAIL_FROM?.trim() || "Standing <onboarding@resend.dev>";
  return {
    to,
    from,
    appBaseUrl: (env.APP_BASE_URL ?? "http://localhost:3000").replace(
      /\/+$/,
      "",
    ),
    send: resendSender(key, from),
  };
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const FOOT =
  "This is Standing's reading of the reasons PayPal publishes, with Standing's own thresholds. It isn't PayPal's decision, " +
  "and it can't say what PayPal will do. PayPal sandbox demo: test money only.";

/** The email for a set of newly opened alerts. Every word is from the alert rows or fixed text. */
export function alertEmail(
  list: Alert[],
  cfg: Pick<EmailConfig, "to" | "appBaseUrl">,
): Email {
  const subject =
    list.length === 1
      ? `Standing: ${list[0].title}`
      : `Standing: ${list.length} things need you`;
  const link = (a: Alert) =>
    `${cfg.appBaseUrl}${a.link && a.link.startsWith("/") ? a.link : "/dashboard"}`;
  const text = [
    list.length === 1
      ? "Something new needs you:"
      : `${list.length} new things need you:`,
    "",
    ...list.flatMap((a) => [
      `- ${a.title}`,
      `  ${a.message}`,
      `  ${link(a)}`,
      "",
    ]),
    `Open your dashboard: ${cfg.appBaseUrl}/dashboard`,
    "",
    FOOT,
  ].join("\n");
  const items = list
    .map(
      (a) =>
        `<tr><td style="padding:14px 18px;border:1px solid #dfddd3;border-radius:10px;background:#fff">` +
        `<div style="font:600 16px Georgia,serif;color:#16201c">${esc(a.title)}</div>` +
        `<div style="font:14px/1.5 Arial,sans-serif;color:#3d4641;margin-top:6px">${esc(a.message)}</div>` +
        `<a href="${esc(link(a))}" style="display:inline-block;margin-top:10px;font:600 14px Arial,sans-serif;color:#0f6b4f">Review</a>` +
        `</td></tr><tr><td style="height:10px"></td></tr>`,
    )
    .join("");
  const html =
    `<div style="background:#fbfaf6;padding:28px 16px"><table role="presentation" width="100%" style="max-width:560px;margin:0 auto;border-collapse:separate">` +
    `<tr><td style="font:600 20px Georgia,serif;color:#0f6b4f;padding-bottom:6px">Standing</td></tr>` +
    `<tr><td style="font:600 22px Georgia,serif;color:#16201c;padding-bottom:16px">${esc(list.length === 1 ? "Something new needs you" : `${list.length} new things need you`)}</td></tr>` +
    items +
    `<tr><td style="padding:8px 0 18px"><a href="${esc(cfg.appBaseUrl)}/dashboard" style="display:inline-block;background:#0f6b4f;color:#fff;font:600 15px Arial,sans-serif;padding:11px 18px;border-radius:8px;text-decoration:none">Open your dashboard</a></td></tr>` +
    `<tr><td style="font:12px/1.5 Arial,sans-serif;color:#5c6660">${esc(FOOT)}</td></tr></table></div>`;
  return {
    to: cfg.to,
    subject,
    text,
    html,
    idempotencyKey: `standing-alerts-${list
      .map((a) => a.id)
      .sort()
      .join("-")}`.slice(0, 256),
  };
}

export interface EmailRun {
  sent: string[]; // alert IDs
  failed: string[];
  error?: string;
}

/**
 * Email the seller about alerts that are open and haven't been emailed yet: the ones this cycle opened, plus earlier
 * failures with attempts left. Warnings only; informational notes stay on the dashboard. One email per run.
 */
export async function emailNewAlerts(
  db: Db,
  sellerId: string,
  fired: Alert[],
  cfg: EmailConfig,
  now = new Date(),
): Promise<EmailRun> {
  await db
    .update(alertEmails)
    .set({ status: "failed", error: "interrupted", updatedAt: now })
    .where(
      and(
        eq(alertEmails.sellerId, sellerId),
        eq(alertEmails.status, "sending"),
        lt(alertEmails.updatedAt, new Date(now.getTime() - STUCK_MS)),
      ),
    );
  const retry = await db
    .select({ alert: alerts })
    .from(alertEmails)
    .innerJoin(alerts, eq(alerts.id, alertEmails.alertId))
    .where(
      and(
        eq(alertEmails.sellerId, sellerId),
        eq(alertEmails.status, "failed"),
        lt(alertEmails.attempts, MAX_ATTEMPTS),
        eq(alerts.status, "open"),
      ),
    );
  const candidates = [
    ...fired.filter((a) => a.severity === "warning" && a.status === "open"),
    ...retry.map((r) => r.alert),
  ];
  const claimed: Alert[] = [];
  for (const a of candidates) {
    if (claimed.some((c) => c.id === a.id)) continue;
    // Claim: a new row, or a failed row with attempts left. A concurrent run can't claim the same alert.
    const fresh = await db
      .insert(alertEmails)
      .values({ alertId: a.id, sellerId, status: "sending", updatedAt: now })
      .onConflictDoNothing()
      .returning();
    if (fresh.length) {
      claimed.push(a);
      continue;
    }
    const again = await db
      .update(alertEmails)
      .set({ status: "sending", updatedAt: now })
      .where(
        and(
          eq(alertEmails.alertId, a.id),
          eq(alertEmails.status, "failed"),
          lt(alertEmails.attempts, MAX_ATTEMPTS),
        ),
      )
      .returning();
    if (again.length) {
      await db
        .update(alertEmails)
        .set({ attempts: again[0].attempts + 1 })
        .where(eq(alertEmails.alertId, a.id));
      claimed.push(a);
    }
  }
  if (!claimed.length) return { sent: [], failed: [] };

  const ids = claimed.map((a) => a.id);
  let result: SendResult;
  try {
    result = await cfg.send(alertEmail(claimed, cfg));
  } catch (err) {
    result = { ok: false, error: `send failed (${(err as Error).name})` };
  }
  if (result.ok) {
    await db
      .update(alertEmails)
      .set({
        status: "sent",
        providerId: result.id,
        error: null,
        updatedAt: now,
      })
      .where(inArray(alertEmails.alertId, ids));
    return { sent: ids, failed: [] };
  }
  await db
    .update(alertEmails)
    .set({
      status: "failed",
      error: result.error.slice(0, 120),
      updatedAt: now,
    })
    .where(inArray(alertEmails.alertId, ids));
  return { sent: [], failed: ids, error: result.error };
}
