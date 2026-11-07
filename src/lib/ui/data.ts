import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { actions, alerts, evidenceItems, launchPlans, packs, shipments, syncState, transactionItems, transactions } from "@/db/schema";
import { verificationItem } from "@/lib/connect/checklist";
import { listDigitalGaps } from "@/lib/digital/module";
import { listTrackingGaps } from "@/lib/fixes/tracking";
import { computeMetrics, THRESHOLDS } from "@/lib/metrics/compute";
import { loadMetricsInput } from "@/lib/metrics/load";
import { planPackStatus } from "@/lib/launch/plan";
import { standingRows } from "@/lib/ui/standing";

// Read-only data for the seller's screens. Every number here is computed by code (CLAUDE.md rule 3);
// the screens only display it.

export async function dashboardData(db: Db, sellerId: string, now = new Date()) {
  const metrics = computeMetrics(await loadMetricsInput(db, sellerId, now));
  const [verification, open, digital, tracking, sync, plans, recentPacks] = await Promise.all([
    verificationItem(db, sellerId),
    db.select().from(alerts).where(and(eq(alerts.sellerId, sellerId), eq(alerts.status, "open"))),
    listDigitalGaps(db, sellerId, now),
    listTrackingGaps(db, sellerId, now),
    db.select().from(syncState).where(eq(syncState.sellerId, sellerId)),
    db
      .select()
      .from(launchPlans)
      .where(and(eq(launchPlans.sellerId, sellerId), gte(launchPlans.launchDate, new Date(now.getTime() - 3 * 86_400_000).toISOString().slice(0, 10))))
      .orderBy(launchPlans.launchDate),
    db.select({ id: packs.id, status: packs.status, createdAt: packs.createdAt }).from(packs).where(eq(packs.sellerId, sellerId)).orderBy(desc(packs.createdAt)).limit(1),
  ]);
  return {
    verification,
    // Warnings first, then calm notes; newest first within each.
    alerts: open
      .sort((a, b) => (a.severity === b.severity ? b.lastSeenAt.getTime() - a.lastSeenAt.getTime() : a.severity === "warning" ? -1 : 1))
      .map((a) => ({ id: a.id, kind: a.kind, severity: a.severity, title: a.title, message: a.message, link: a.link, since: a.firstFiredAt.toISOString() })),
    metrics,
    standing: standingRows(metrics, open),
    thresholds: THRESHOLDS,
    digital,
    tracking,
    launchPlans: await Promise.all(
      plans.map(async (p) => ({ id: p.id, launchDate: p.launchDate, expectedMultiple: Number(p.expectedMultiple), policy: p.policy, packId: p.packId, packStatus: await planPackStatus(db, p.packId) })),
    ),
    latestPack: recentPacks[0] ? { ...recentPacks[0], createdAt: recentPacks[0].createdAt.toISOString() } : null,
    sync: sync.map((s) => ({ job: s.job, lastRunAt: s.lastRunAt?.toISOString() ?? null, ok: !s.lastError, lastError: s.lastError, syncedThrough: s.syncedThrough?.toISOString() ?? null })),
  };
}

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;

export interface OrderRow {
  transactionId: string;
  date: string;
  amount: number; // dollars, for sorting; display uses `amountText`
  amountText: string;
  kind: string; // physical / digital / service / unclassified
  categories: string;
  tracking: string; // e.g. "USPS STANDINGD1PHY01 (SHIPPED)", "Completed", "missing", "—"
  trackingState: "tracked" | "completed" | "missing" | "none";
  evidence: number;
  fix: string | null; // status of a Standing fix for this order, if any
  items: string; // item names as PayPal returned them, "" when PayPal sent none
  protection: Protection;
}

/** PayPal's own Seller Protection flag on the transaction, read as sent (Transaction Search `protection_eligibility`). */
export type Protection = "eligible" | "partial" | "not eligible" | "not stated";

/** Codes from PayPal's Transaction Search spec: 01 eligible, 02 not eligible, 03 partially eligible. */
export function protectionLabel(code: unknown): Protection {
  if (code === "01") return "eligible";
  if (code === "02") return "not eligible";
  if (code === "03") return "partial";
  return "not stated";
}

/** One row per sale in the last 90 days: the AG Grid table. */
export async function orderRows(db: Db, sellerId: string, now = new Date()): Promise<OrderRow[]> {
  const { sales } = await loadMetricsInput(db, sellerId, now);
  const ids = sales.map((s) => s.id);
  if (!ids.length) return [];
  const [ship, ev, fixes, flags, items] = await Promise.all([
    db.select().from(shipments).where(inArray(shipments.transactionId, ids)),
    db.select({ transactionId: evidenceItems.transactionId }).from(evidenceItems).where(and(eq(evidenceItems.sellerId, sellerId), inArray(evidenceItems.transactionId, ids))),
    db.select({ requestId: actions.requestId, status: actions.status, payload: actions.payload }).from(actions).where(eq(actions.sellerId, sellerId)),
    db
      .select({ id: transactions.transactionId, code: sql<string | null>`${transactions.raw}->'transaction_info'->>'protection_eligibility'` })
      .from(transactions)
      .where(inArray(transactions.transactionId, ids)),
    db.select({ id: transactionItems.transactionId, name: transactionItems.name, position: transactionItems.position }).from(transactionItems).where(inArray(transactionItems.transactionId, ids)),
  ]);
  return sales
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((s) => {
      const mine = ship.filter((x) => x.transactionId === s.id && x.status !== "CANCELLED");
      const tracked = mine.find((x) => x.trackingNumber);
      const completed = mine.some((x) => x.status === "COMPLETED");
      const physicalDue = s.kind === "physical" && s.at.getTime() <= now.getTime() - 48 * 3_600_000;
      const fix = fixes.find((f) => f.requestId === `complete-${s.id}` || f.requestId.startsWith(`track-${s.id}-`));
      return {
        transactionId: s.id,
        date: s.at.toISOString(),
        amount: s.cents / 100,
        amountText: `USD ${(s.cents / 100).toFixed(2)}`,
        kind: s.kind ?? "unclassified",
        categories: s.categories.join(", "),
        tracking: tracked ? `${tracked.carrier ?? ""} ${tracked.trackingNumber} (${tracked.status})`.trim() : completed ? "Completed" : physicalDue ? "missing" : "—",
        trackingState: tracked ? "tracked" : completed ? "completed" : physicalDue ? "missing" : "none",
        evidence: ev.filter((e) => e.transactionId === s.id).length,
        fix: fix?.status ?? null,
        items: items
          .filter((i) => i.id === s.id && i.name)
          .sort((a, b) => a.position - b.position)
          .map((i) => i.name)
          .join(", "),
        protection: protectionLabel(flags.find((f) => f.id === s.id)?.code),
      };
    });
}

export async function packList(db: Db, sellerId: string) {
  const rows = await db.select().from(packs).where(eq(packs.sellerId, sellerId)).orderBy(desc(packs.createdAt)).limit(20);
  return rows.map((p) => ({ id: p.id, status: p.status, createdAt: p.createdAt.toISOString(), periodFrom: p.periodFrom.toISOString(), periodTo: p.periodTo.toISOString(), attempts: p.attempts, provider: p.provider }));
}

/** A pack for the viewer, only if it belongs to this seller. */
export async function packDetail(db: Db, sellerId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [p] = await db.select().from(packs).where(and(eq(packs.id, id), eq(packs.sellerId, sellerId)));
  if (!p) return null;
  return {
    id: p.id,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    periodFrom: p.periodFrom.toISOString(),
    periodTo: p.periodTo.toISOString(),
    salesCurve: p.salesCurve,
    letter: p.letter,
    evidence: p.evidence,
    problems: p.validation?.problems ?? [],
    attempts: p.attempts,
  };
}
