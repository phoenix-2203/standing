import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { sendFix } from "@/lib/fixes/fixes";
import { load } from "@/lib/paypal/actions";
import { paypalFromEnv } from "@/lib/paypal/client";

// Send an approved fix once its cancel window has run out (the queue refuses earlier).
export async function POST(request: Request, ctx: RouteContext<"/api/actions/[requestId]/send">) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const { requestId } = await ctx.params;
  const db = getDb();
  const owned = await load(db, requestId).catch(() => null);
  if (owned?.sellerId !== sellerId) return Response.json({ error: "not_found" }, { status: 404 });
  const r = await sendFix(db, paypalFromEnv(), sellerId, requestId);
  return Response.json({ outcome: r.outcome, status: r.action.status, paypalHttpStatus: r.action.paypalHttpStatus, paypalDebugId: r.action.paypalDebugId, undoUntil: r.action.undoUntil });
}
