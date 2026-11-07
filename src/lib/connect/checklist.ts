import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { packs, paypalConnections } from "@/db/schema";
import { computeMetrics, THRESHOLDS } from "@/lib/metrics/compute";
import { loadMetricsInput } from "@/lib/metrics/load";

// The seller's checklist. Item 1 is the verified-seller check; wording comes from code.

export type ItemState = "done" | "todo" | "unknown";

export interface ChecklistItem {
  id: string;
  state: ItemState;
  title: string;
  detail: string;
  action?: { label: string; href: string };
}

export async function verificationItem(db: Db, sellerId: string): Promise<ChecklistItem> {
  const [c] = await db.select().from(paypalConnections).where(eq(paypalConnections.sellerId, sellerId));
  const reconnect = { label: "Log in with PayPal", href: "/api/auth/paypal/start" };
  if (!c) return { id: "verified-seller", state: "todo", title: "Connect your PayPal account", detail: "Log in with PayPal so Standing can read your account's verification status.", action: reconnect };
  if (c.verification === "verified") return { id: "verified-seller", state: "done", title: "PayPal account verified", detail: "PayPal reports this account as verified." };
  if (c.verification === "unverified") {
    return {
      id: "verified-seller",
      state: "todo",
      title: "Verify your PayPal account",
      detail: "PayPal reports this account as unverified. Complete verification in your PayPal account settings, then log in again.",
      action: { label: "Check again", href: reconnect.href },
    };
  }
  return {
    id: "verified-seller",
    state: "unknown",
    title: "Couldn't read your verification status",
    detail: "PayPal didn't return your account's verification status, so Standing doesn't know it. This doesn't mean your account is unverified. Try again.",
    action: { label: "Try again", href: reconnect.href },
  };
}

/** What a seller should have ready before PayPal asks. Each item's state is worked out by code from stored data. */
export async function buildChecklist(db: Db, sellerId: string, now = new Date()): Promise<ChecklistItem[]> {
  const m = computeMetrics(await loadMetricsInput(db, sellerId, now));
  const [latest] = await db.select({ status: packs.status }).from(packs).where(eq(packs.sellerId, sellerId)).orderBy(desc(packs.createdAt)).limit(1);
  const c = m.trackingCoverage;
  const g = m.digitalCompletionGap;
  return [
    await verificationItem(db, sellerId),
    c.coverage === null
      ? {
          id: "tracking",
          state: "unknown",
          title: "Tracking on physical orders",
          detail:
            c.unclassifiedOrders > 0
              ? `Standing can't tell which of your ${c.unclassifiedOrders} orders are physical yet, because their products aren't in your catalogue.`
              : "No physical orders older than 48 hours yet.",
          ...(c.unclassifiedOrders > 0 ? { action: { label: "Add your products", href: "/catalogue" } } : {}),
        }
      : c.coverage >= THRESHOLDS.trackingCoverage
        ? { id: "tracking", state: "done", title: "Tracking on physical orders", detail: `${c.withTracking} of ${c.eligible} physical orders older than 48 hours have tracking in PayPal.` }
        : {
            id: "tracking",
            state: "todo",
            title: "Add tracking to physical orders",
            detail: `${c.eligible - c.withTracking} of ${c.eligible} physical orders older than 48 hours have no tracking in PayPal.`,
            action: { label: "See orders", href: "/orders" },
          },
    g.count === 0 && c.unclassifiedOrders > 0
      ? {
          id: "digital",
          state: "unknown",
          title: "Digital orders marked Completed",
          detail: `Standing can't tell whether any of your ${c.unclassifiedOrders} unclassified orders are digital, because their products aren't in your catalogue.`,
          action: { label: "Add your products", href: "/catalogue" },
        }
      : g.count === 0
      ? { id: "digital", state: "done", title: "Digital orders marked Completed", detail: "No digital or service orders over 24 hours old are waiting to be marked Completed." }
      : {
          id: "digital",
          state: "todo",
          title: "Mark digital orders Completed",
          detail: `${g.count} digital or service ${g.count === 1 ? "order is" : "orders are"} over 24 hours old and not marked Completed in PayPal.`,
          action: { label: "Mark them Completed", href: "/dashboard" },
        },
    latest?.status === "ready"
      ? { id: "pack", state: "done", title: "Explanation pack ready", detail: "Your latest pack passed the citation check and can be downloaded.", action: { label: "Open packs", href: "/packs" } }
      : {
          id: "pack",
          state: "todo",
          title: "Build your explanation pack",
          detail: latest ? "Your latest pack was blocked by the citation check. Build a new one." : "Build it now, so your case is ready before anyone asks.",
          action: { label: "Build a pack", href: "/packs" },
        },
  ];
}
