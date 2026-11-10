import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { disputeResponse } from "@/lib/disputes/respond";

// A response the seller reads, edits and sends in PayPal's Resolution Center. Written by code; nothing is sent.
export async function GET(request: Request, ctx: RouteContext<"/api/disputes/[id]/response">) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) return Response.json({ error: "not_found" }, { status: 404 });
  const r = await disputeResponse(getDb(), sellerId, id);
  return r ? Response.json(r) : Response.json({ error: "not_found" }, { status: 404 });
}
