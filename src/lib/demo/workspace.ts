import { randomBytes } from "node:crypto";
import { and, eq, inArray, like, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  actions,
  alertEmails,
  alerts,
  demoWorkspaces,
  disputes,
  evidenceItems,
  launchPlans,
  metricsDaily,
  packs,
  paypalConnections,
  policyVerdicts,
  products,
  shipments,
  shopOrders,
  syncState,
  transactionItems,
  transactions,
} from "@/db/schema";
import { applyAlerts } from "@/lib/alerts/engine";
import { syncLedger } from "@/lib/evidence/ledger";
import { computeMetrics } from "@/lib/metrics/compute";
import { loadMetricsInput } from "@/lib/metrics/load";
import { PayPalClient, SANDBOX_BASE } from "@/lib/paypal/client";

// "Try the demo": each tester gets a private, fully interactive copy of the demo shop (the sandbox seller's real
// sandbox data), so nothing one tester does affects another or the real demo seller. Differences, all shown in the app:
// - IDs are rewritten (PayPal transaction IDs are unique across the database), so a copy's IDs aren't real PayPal IDs;
// - dates are moved forward so the newest sale is two hours old, keeping the signals current;
// - the final "send to PayPal" step is simulated: no PayPal call is made, and the stored answer says SIMULATED;
// - AI calls are capped per workspace, and workspaces are deleted after DEMO_TTL_HOURS.

export const DEMO_PREFIX = "demo-";
export const DEMO_TTL_HOURS = 48;
export const MAX_WORKSPACES = 300;
export const LIMITS = { asks: 25, packs: 6 };
export const SIMULATED_DEBUG_ID = "SIMULATED-DEMO";

export const isDemoSeller = (
  sellerId: string | null | undefined,
): sellerId is string => !!sellerId && sellerId.startsWith(DEMO_PREFIX);

export function demoEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.STANDING_DEMO === "1" && !!env.SESSION_SECRET;
}

type Row = Record<string, unknown>;

/** Deep copy with every known ID swapped and every Date moved by `shiftMs`. Dates inside jsonb stay as written. */
function rewrite(
  value: unknown,
  swap: (s: string) => string,
  shiftMs: number,
  top = true,
): unknown {
  if (value instanceof Date)
    return top ? new Date(value.getTime() + shiftMs) : value;
  if (typeof value === "string") return swap(value);
  if (Array.isArray(value))
    return value.map((v) => rewrite(v, swap, shiftMs, false));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        rewrite(v, swap, shiftMs, false),
      ]),
    );
  return value;
}
const copyRow = (
  row: Row,
  swap: (s: string) => string,
  shiftMs: number,
  drop: string[] = [],
): Row =>
  Object.fromEntries(
    Object.entries(row)
      .filter(([k]) => !drop.includes(k))
      .map(([k, v]) => [
        k,
        v instanceof Date
          ? new Date(v.getTime() + shiftMs)
          : rewrite(v, swap, shiftMs, false),
      ]),
  );

/** Make a tester's copy of `source`. Returns the new seller ID. */
export async function createDemoWorkspace(
  db: Db,
  source: string,
  now = new Date(),
): Promise<string> {
  const tag = randomBytes(4).toString("hex").toUpperCase(); // 8 hex chars
  const sellerId = `${DEMO_PREFIX}${tag.toLowerCase()}`;
  await db
    .insert(demoWorkspaces)
    .values({ sellerId, sourceSellerId: source, createdAt: now });

  const txns = await db
    .select()
    .from(transactions)
    .where(eq(transactions.sellerId, source));
  const ids = txns.map((t) => t.transactionId);
  const newest = txns.reduce((m, t) => Math.max(m, t.initiatedAt.getTime()), 0);
  const shiftMs = newest ? now.getTime() - 2 * 3_600_000 - newest : 0;
  // Every transaction ID becomes D<tag><id>; longest first so no ID is a prefix of another's replacement.
  const sorted = [...ids].sort((a, b) => b.length - a.length);
  const pattern = sorted.length
    ? new RegExp(
        sorted.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
        "g",
      )
    : null;
  const swap = (s: string) =>
    s === source
      ? sellerId
      : pattern
        ? s.replace(pattern, (m) => `D${tag}${m}`)
        : s;
  const own = <T extends Row>(rows: T[], drop: string[] = []): Row[] =>
    rows.map((r) => ({ ...copyRow(r, swap, shiftMs, drop), sellerId }));

  if (txns.length) {
    await db.insert(transactions).values(own(txns) as never);
    const items = await db
      .select()
      .from(transactionItems)
      .where(inArray(transactionItems.transactionId, ids));
    if (items.length)
      await db
        .insert(transactionItems)
        .values(items.map((r) => copyRow(r, swap, shiftMs, ["id"])) as never);
  }
  const copyAll = async (table: never, rows: Row[], drop: string[] = []) => {
    if (rows.length) await db.insert(table).values(own(rows, drop) as never);
  };
  await copyAll(
    products as never,
    await db.select().from(products).where(eq(products.sellerId, source)),
    ["id"],
  );
  await copyAll(
    shopOrders as never,
    await db.select().from(shopOrders).where(eq(shopOrders.sellerId, source)),
  );
  await copyAll(
    shipments as never,
    await db.select().from(shipments).where(eq(shipments.sellerId, source)),
    ["id"],
  );
  await copyAll(
    policyVerdicts as never,
    await db
      .select()
      .from(policyVerdicts)
      .where(eq(policyVerdicts.sellerId, source)),
  );
  // Disputes: a copy's dispute ID must differ even when it doesn't contain a transaction ID.
  const ds = await db
    .select()
    .from(disputes)
    .where(eq(disputes.sellerId, source));
  if (ds.length) {
    await db.insert(disputes).values(
      own(ds).map((d) => ({
        ...d,
        disputeId: String(d.disputeId).includes(`D${tag}`)
          ? d.disputeId
          : `${String(d.disputeId).startsWith("SIM-") ? "" : "DEMO-"}${tag}-${d.disputeId}`,
      })) as never,
    );
  }
  // What the seller added (invoices, traffic sources, delivery proof) is copied as written; PayPal-sourced evidence is
  // rebuilt from the copied records below, so its dates and IDs match.
  await copyAll(
    evidenceItems as never,
    await db
      .select()
      .from(evidenceItems)
      .where(
        and(
          eq(evidenceItems.sellerId, source),
          eq(evidenceItems.source, "seller"),
        ),
      ),
  );
  await db.insert(paypalConnections).values({
    sellerId,
    verification: "verified",
    payerId: null,
    debugId: null,
    lastError: null,
    checkedAt: now,
  });
  await db.insert(syncState).values(
    (["transactions", "disputes", "trackers"] as const).map((job) => ({
      sellerId,
      job,
      lastRunAt: now,
      syncedThrough: now,
    })) as never,
  );

  await syncLedger(db, sellerId, "USD", now);
  await applyAlerts(
    db,
    sellerId,
    computeMetrics(await loadMetricsInput(db, sellerId, now)),
    now,
  );
  return sellerId;
}

/** Delete workspaces older than DEMO_TTL_HOURS, every row they own included. Returns how many went. */
export async function purgeDemoWorkspaces(
  db: Db,
  now = new Date(),
  ttlHours = DEMO_TTL_HOURS,
): Promise<number> {
  const old = await db
    .select({ id: demoWorkspaces.sellerId })
    .from(demoWorkspaces)
    .where(
      lt(
        demoWorkspaces.createdAt,
        new Date(now.getTime() - ttlHours * 3_600_000),
      ),
    );
  const ids = old.map((o) => o.id).filter(isDemoSeller);
  if (!ids.length) return 0;
  const tx = await db
    .select({ id: transactions.transactionId })
    .from(transactions)
    .where(inArray(transactions.sellerId, ids));
  if (tx.length)
    await db.delete(transactionItems).where(
      inArray(
        transactionItems.transactionId,
        tx.map((t) => t.id),
      ),
    );
  const alertRows = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(inArray(alerts.sellerId, ids));
  if (alertRows.length)
    await db.delete(alertEmails).where(
      inArray(
        alertEmails.alertId,
        alertRows.map((a) => a.id),
      ),
    );
  for (const t of [
    transactions,
    products,
    shopOrders,
    shipments,
    policyVerdicts,
    disputes,
    evidenceItems,
    paypalConnections,
    syncState,
    alerts,
    packs,
    launchPlans,
    metricsDaily,
  ] as const) {
    await db
      .delete(t)
      .where(inArray((t as unknown as { sellerId: never }).sellerId, ids));
  }
  await db.delete(actions).where(inArray(actions.sellerId, ids));
  await db.delete(demoWorkspaces).where(inArray(demoWorkspaces.sellerId, ids));
  return ids.length;
}

export async function liveWorkspaces(db: Db): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(demoWorkspaces)
    .where(like(demoWorkspaces.sellerId, `${DEMO_PREFIX}%`));
  return r?.n ?? 0;
}

/**
 * Count one use of an AI feature in a demo workspace. Returns false when the workspace has used its allowance
 * (the route then says so). Real sellers aren't limited here.
 */
export async function spendAllowance(
  db: Db,
  sellerId: string,
  what: keyof typeof LIMITS,
): Promise<boolean> {
  if (!isDemoSeller(sellerId)) return true;
  const col = what === "asks" ? demoWorkspaces.asks : demoWorkspaces.packs;
  const updated = await db
    .update(demoWorkspaces)
    .set(
      what === "asks"
        ? { asks: sql`${demoWorkspaces.asks} + 1` }
        : { packs: sql`${demoWorkspaces.packs} + 1` },
    )
    .where(and(eq(demoWorkspaces.sellerId, sellerId), lt(col, LIMITS[what])))
    .returning();
  return updated.length > 0;
}

/**
 * The PayPal client for a demo workspace: the real client code with a fetch that never leaves the server. Writes get
 * PayPal-shaped 201 answers marked SIMULATED; reads get empty lists. Nothing reaches PayPal.
 */
export function simulatedPayPal(): PayPalClient {
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = {
      "paypal-debug-id": SIMULATED_DEBUG_ID,
      "content-type": "application/json",
    };
    if (url.pathname === "/v1/oauth2/token")
      return new Response(
        JSON.stringify({ access_token: "simulated", expires_in: 32400 }),
        { status: 200, headers },
      );
    if ((init?.method ?? "GET") === "GET")
      return new Response(
        JSON.stringify({ trackers: [], items: [], transaction_details: [] }),
        { status: 200, headers },
      );
    return new Response(
      JSON.stringify({
        simulated: true,
        note: "Demo workspace: nothing was sent to PayPal.",
      }),
      { status: 201, headers },
    );
  }) as typeof globalThis.fetch;
  return new PayPalClient({
    baseUrl: SANDBOX_BASE,
    clientId: "simulated",
    clientSecret: "simulated",
    fetch,
  });
}
