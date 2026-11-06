import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { paypalConnections } from "@/db/schema";

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

export async function buildChecklist(db: Db, sellerId: string): Promise<ChecklistItem[]> {
  return [await verificationItem(db, sellerId)];
}
