import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { paypalConnections } from "@/db/schema";
import { sellerEvidence } from "@/lib/evidence/ledger";
import { dashboardData } from "@/lib/ui/data";

// "My money is already held": a rescue checklist built from what Standing already knows. Code decides every step and
// its state from the seller's own records; nothing here is AI-written, nothing is sent to PayPal, and it never says a
// hold will be released, because only PayPal decides that.

export type StepState = "todo" | "done" | "unknown";
export interface HeldStep {
  id: "verify" | "tracking" | "digital" | "evidence" | "pack";
  title: string;
  detail: string;
  state: StepState;
  action: { label: string; href: string } | null;
}

export interface HeldInput {
  verification: string; // "verified" | "unverified" | "unreadable" | "not_connected"
  trackingMissing: number;
  digitalNotCompleted: number;
  evidenceAdded: number;
  latestPack: { id: string; status: string } | null;
}

const n = (k: number, one: string, many: string) =>
  `${k} ${k === 1 ? one : many}`;

/** The steps, in the order that helps most first: what PayPal can check, then the seller's case. */
export function heldSteps(i: HeldInput): HeldStep[] {
  return [
    {
      id: "tracking",
      title: "Add tracking to shipped orders",
      detail: i.trackingMissing
        ? `${n(i.trackingMissing, "physical order has", "physical orders have")} no tracking in PayPal after 48 hours. PayPal's advice to sellers is to ship promptly and give buyers valid tracking.`
        : "Every physical order older than 48 hours has tracking in PayPal.",
      state: i.trackingMissing ? "todo" : "done",
      action: i.trackingMissing
        ? { label: "Add tracking", href: "/dashboard#tracking" }
        : null,
    },
    {
      id: "digital",
      title: "Mark delivered digital orders Completed",
      detail: i.digitalNotCompleted
        ? `${n(i.digitalNotCompleted, "digital order isn't", "digital orders aren't")} marked Completed in PayPal yet.`
        : "No digital orders are waiting to be marked Completed.",
      state: i.digitalNotCompleted ? "todo" : "done",
      action: i.digitalNotCompleted
        ? { label: "Mark Completed", href: "/dashboard#digital-h" }
        : null,
    },
    {
      id: "verify",
      title: "Confirm your PayPal account",
      detail:
        i.verification === "verified"
          ? "PayPal reports this account as verified."
          : i.verification === "unverified"
            ? "PayPal reports this account as unverified. PayPal says confirmed identity gets new sellers faster access to their money."
            : i.verification === "not_connected"
              ? "Log in with PayPal so Standing can read whether your account is verified."
              : "Standing couldn't read whether this account is verified. That doesn't mean it's unverified.",
      state:
        i.verification === "verified"
          ? "done"
          : i.verification === "unreadable"
            ? "unknown"
            : "todo",
      action:
        i.verification === "verified"
          ? null
          : { label: "See how", href: "/checklist" },
    },
    {
      id: "evidence",
      title: "Add what PayPal can't see",
      detail: i.evidenceAdded
        ? `You've added ${n(i.evidenceAdded, "item", "items")}: supplier invoices or where a spike came from.`
        : "A supplier invoice and the post that sent buyers to you are the two things that explain a busy week best.",
      state: i.evidenceAdded ? "done" : "todo",
      action: {
        label: i.evidenceAdded ? "Add more" : "Add evidence",
        href: "/evidence",
      },
    },
    {
      id: "pack",
      title: "Have your case ready",
      detail:
        i.latestPack?.status === "ready"
          ? "Your explanation pack is ready: a letter, your sales curve and numbered evidence, as a PDF."
          : i.latestPack
            ? "Your latest pack was blocked by Standing's checks. Build a new one once the steps above are done."
            : "Build an explanation pack once the steps above are done, so it includes them.",
      state: i.latestPack?.status === "ready" ? "done" : "todo",
      action:
        i.latestPack?.status === "ready"
          ? { label: "Open pack", href: `/packs/${i.latestPack.id}` }
          : { label: "Build pack", href: "/packs" },
    },
  ];
}

/** What not to do. The same lines Ask Standing refuses to help with: they look like hiding, and make a review worse. */
export const DONT = [
  "Open a second PayPal account to keep selling. PayPal's policies tie accounts together, and it looks like avoiding a review.",
  "Split payments or invoices into smaller amounts so they stand out less.",
  "Describe products as something else, or ask buyers to pay as friends and family.",
  "Move sales to someone else's account until the hold ends.",
];

export async function heldData(db: Db, sellerId: string, now = new Date()) {
  const [d, evidence, [conn]] = await Promise.all([
    dashboardData(db, sellerId, now),
    sellerEvidence(db, sellerId),
    db
      .select({ v: paypalConnections.verification })
      .from(paypalConnections)
      .where(eq(paypalConnections.sellerId, sellerId)),
  ]);
  // A fix already sent counts as done; one waiting in its cancel window doesn't yet.
  const input: HeldInput = {
    verification: conn?.v ?? "not_connected",
    trackingMissing: d.tracking.filter(
      (t) => t.overdue && t.fix?.status !== "sent",
    ).length,
    digitalNotCompleted: d.digital.filter((g) => g.fix?.status !== "sent")
      .length,
    evidenceAdded: evidence.length,
    latestPack: d.latestPack
      ? { id: d.latestPack.id, status: d.latestPack.status }
      : null,
  };
  const steps = heldSteps(input);
  return {
    steps,
    todo: steps.filter((s) => s.state === "todo").length,
    dont: DONT,
  };
}
