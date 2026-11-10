import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { alertEmails, alerts } from "@/db/schema";
import type { Alert } from "@/lib/alerts/engine";
import { testDb } from "@/test/helpers";
import {
  alertEmail,
  type Email,
  type EmailConfig,
  emailConfigFromEnv,
  emailNewAlerts,
  MAX_ATTEMPTS,
  resendSender,
  type SendResult,
} from "./email";

const SELLER = "seller-1";
const NOW = new Date("2026-11-10T09:00:00Z");
let db: Db;
beforeEach(async () => {
  db = await testDb();
});

async function alert(
  kind: string,
  extra: Partial<typeof alerts.$inferInsert> = {},
): Promise<Alert> {
  const [row] = await db
    .insert(alerts)
    .values({
      sellerId: SELLER,
      kind,
      title: `Title ${kind}`,
      message: `Order 7181 ($180.00) is 5.4× your average (${kind}).`,
      facts: {},
      firstFiredAt: NOW,
      lastSeenAt: NOW,
      link: "/orders",
      ...extra,
    })
    .returning();
  return row;
}

function config(results: SendResult[] = [{ ok: true, id: "msg-1" }]) {
  const sent: Email[] = [];
  const cfg: EmailConfig = {
    to: "seller@example.com",
    from: "Standing <onboarding@resend.dev>",
    appBaseUrl: "https://standing.test",
    send: async (e) => {
      sent.push(e);
      return results[Math.min(sent.length - 1, results.length - 1)];
    },
  };
  return { cfg, sent };
}

describe("emailNewAlerts", () => {
  it("sends one email for all newly opened warnings, and records each alert as sent", async () => {
    const a = await alert("large_order");
    const b = await alert("missing_tracking");
    const { cfg, sent } = config();
    const run = await emailNewAlerts(db, SELLER, [a, b], cfg, NOW);
    expect(run.sent.sort()).toEqual([a.id, b.id].sort());
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Standing: 2 things need you");
    expect(
      (await db.select().from(alertEmails)).map((r) => [
        r.status,
        r.providerId,
      ]),
    ).toEqual([
      ["sent", "msg-1"],
      ["sent", "msg-1"],
    ]);
  });

  it("never emails the same alert twice, even if it's passed again", async () => {
    const a = await alert("large_order");
    const { cfg, sent } = config();
    await emailNewAlerts(db, SELLER, [a], cfg, NOW);
    const again = await emailNewAlerts(db, SELLER, [a], cfg, NOW);
    expect(again.sent).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it("skips informational alerts and alerts no longer open", async () => {
    const info = await alert("disputes_note", { severity: "info" });
    const gone = await alert("old", { status: "resolved" });
    const { cfg, sent } = config();
    expect(await emailNewAlerts(db, SELLER, [info, gone], cfg, NOW)).toEqual({
      sent: [],
      failed: [],
    });
    expect(sent).toHaveLength(0);
  });

  it("a failed send is recorded and retried on later cycles, at most MAX_ATTEMPTS in total", async () => {
    const a = await alert("large_order");
    const { cfg, sent } = config([{ ok: false, error: "HTTP 500" }]);
    const first = await emailNewAlerts(db, SELLER, [a], cfg, NOW);
    expect(first).toMatchObject({ failed: [a.id], error: "HTTP 500" });
    for (let i = 0; i < 5; i++) await emailNewAlerts(db, SELLER, [], cfg, NOW);
    expect(sent).toHaveLength(MAX_ATTEMPTS);
    const [row] = await db.select().from(alertEmails);
    expect([row.status, row.attempts, row.error]).toEqual([
      "failed",
      MAX_ATTEMPTS,
      "HTTP 500",
    ]);
  });

  it("a retry that succeeds marks the alert sent and stops", async () => {
    const a = await alert("large_order");
    const { cfg, sent } = config([
      { ok: false, error: "HTTP 503" },
      { ok: true, id: "msg-2" },
    ]);
    await emailNewAlerts(db, SELLER, [a], cfg, NOW);
    expect((await emailNewAlerts(db, SELLER, [], cfg, NOW)).sent).toEqual([
      a.id,
    ]);
    await emailNewAlerts(db, SELLER, [], cfg, NOW);
    expect(sent).toHaveLength(2);
    expect((await db.select().from(alertEmails))[0]).toMatchObject({
      status: "sent",
      providerId: "msg-2",
      error: null,
      attempts: 2,
    });
  });

  it("a sender that throws is recorded as failed, not left as 'sending'", async () => {
    const a = await alert("large_order");
    const cfg = {
      ...config().cfg,
      send: async () => {
        throw new Error("boom");
      },
    };
    expect(await emailNewAlerts(db, SELLER, [a], cfg, NOW)).toMatchObject({
      failed: [a.id],
      error: "send failed (Error)",
    });
    expect((await db.select().from(alertEmails))[0].status).toBe("failed");
  });

  it("a send interrupted mid-way ('sending' for over 10 minutes) is retried", async () => {
    const a = await alert("large_order");
    await db
      .insert(alertEmails)
      .values({
        alertId: a.id,
        sellerId: SELLER,
        status: "sending",
        updatedAt: new Date(NOW.getTime() - 11 * 60_000),
      });
    const { cfg, sent } = config();
    expect((await emailNewAlerts(db, SELLER, [], cfg, NOW)).sent).toEqual([
      a.id,
    ]);
    expect(sent).toHaveLength(1);
  });

  it("a send still in progress (under 10 minutes) is left alone", async () => {
    const a = await alert("large_order");
    await db
      .insert(alertEmails)
      .values({
        alertId: a.id,
        sellerId: SELLER,
        status: "sending",
        updatedAt: new Date(NOW.getTime() - 60_000),
      });
    const { cfg, sent } = config();
    await emailNewAlerts(db, SELLER, [a], cfg, NOW);
    expect(sent).toHaveLength(0);
  });

  it("only retries this seller's alerts", async () => {
    const theirs = await alert("large_order", { sellerId: "someone-else" });
    await db
      .insert(alertEmails)
      .values({
        alertId: theirs.id,
        sellerId: "someone-else",
        status: "failed",
        updatedAt: NOW,
      });
    const { cfg, sent } = config();
    await emailNewAlerts(db, SELLER, [], cfg, NOW);
    expect(sent).toHaveLength(0);
  });
});

describe("alertEmail", () => {
  it("uses the alert's own words and numbers, links into the app, and says it isn't PayPal's decision", async () => {
    const a = await alert("large_order");
    const e = alertEmail([a], {
      to: "s@example.com",
      appBaseUrl: "https://standing.test",
    });
    expect(e.subject).toBe("Standing: Title large_order");
    expect(e.text).toContain(a.message);
    expect(e.text).toContain("https://standing.test/orders");
    expect(e.text).toMatch(/isn't PayPal's decision/);
    expect(e.text).toMatch(/test money/);
    expect(`${e.subject}${e.text}`).not.toMatch(
      /release|guarantee|will be approved/i,
    );
  });

  it("escapes alert text in the HTML and never links off-site from an alert", async () => {
    const a = await alert("x", {
      title: "<script>alert(1)</script>",
      link: "https://evil.example",
    });
    const e = alertEmail([a], {
      to: "s@example.com",
      appBaseUrl: "https://standing.test",
    });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).not.toContain("evil.example");
    expect(e.html).toContain("https://standing.test/dashboard");
  });
});

describe("config and sender", () => {
  it("is off unless both a recipient and a key are set", () => {
    expect(emailConfigFromEnv({})).toBeNull();
    expect(emailConfigFromEnv({ STANDING_ALERT_EMAIL: "a@b.c" })).toBeNull();
    expect(emailConfigFromEnv({ RESEND_API_KEY: "k" })).toBeNull();
    expect(
      emailConfigFromEnv({
        STANDING_ALERT_EMAIL: "a@b.c",
        RESEND_API_KEY: "k",
        APP_BASE_URL: "https://x.test/",
      }),
    ).toMatchObject({
      to: "a@b.c",
      from: "Standing <onboarding@resend.dev>",
      appBaseUrl: "https://x.test",
    });
  });

  it("calls Resend with the key, an idempotency key and the message, and never returns the response body", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = resendSender("re_test", "Standing <a@b.c>", (async (
      url: string,
      init: RequestInit,
    ) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "msg-9" }), { status: 200 });
    }) as unknown as typeof fetch);
    expect(
      await ok({
        to: "s@x.y",
        subject: "S",
        text: "T",
        html: "<p>T</p>",
        idempotencyKey: "k1",
      }),
    ).toEqual({ ok: true, id: "msg-9" });
    const h = calls[0].init.headers as Record<string, string>;
    expect([calls[0].url, h.Authorization, h["Idempotency-Key"]]).toEqual([
      "https://api.resend.com/emails",
      "Bearer re_test",
      "k1",
    ]);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      from: "Standing <a@b.c>",
      to: ["s@x.y"],
      subject: "S",
    });

    const bad = resendSender(
      "re_test",
      "a@b.c",
      (async () =>
        new Response(JSON.stringify({ message: "secret detail re_test" }), {
          status: 422,
        })) as unknown as typeof fetch,
    );
    expect(
      await bad({
        to: "s",
        subject: "",
        text: "",
        html: "",
        idempotencyKey: "k",
      }),
    ).toEqual({ ok: false, error: "HTTP 422" });
    const down = resendSender("re_test", "a@b.c", (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    expect(
      await down({
        to: "s",
        subject: "",
        text: "",
        html: "",
        idempotencyKey: "k",
      }),
    ).toEqual({ ok: false, error: "request failed (TypeError)" });
  });
});
