import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { removeSellerEvidence } from "@/lib/evidence/ledger";

// Remove something the seller added. Packs already built keep their own copy.
export async function DELETE(request: Request, ctx: RouteContext<"/api/evidence/[id]">) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const { id } = await ctx.params;
  return (await removeSellerEvidence(getDb(), sellerId, id)) ? new Response(null, { status: 204 }) : Response.json({ error: "not_found" }, { status: 404 });
}
