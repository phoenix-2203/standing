import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { cancelAction, load } from "@/lib/paypal/actions";

export async function POST(request: Request, ctx: RouteContext<"/api/actions/[requestId]/cancel">) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const { requestId } = await ctx.params;
  const db = getDb();
  const owned = await load(db, requestId).catch(() => null);
  if (owned?.sellerId !== sellerId) return Response.json({ error: "not_found" }, { status: 404 });
  const { cancelled, action } = await cancelAction(db, requestId);
  return Response.json({ cancelled, status: action.status }, { status: cancelled ? 200 : 409 });
}
