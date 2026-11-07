import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { deleteProduct } from "@/lib/catalogue/catalogue";

export async function DELETE(request: Request, ctx: RouteContext<"/api/products/[id]">) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const { id } = await ctx.params;
  return (await deleteProduct(getDb(), sellerId, id)) ? new Response(null, { status: 204 }) : Response.json({ error: "not_found" }, { status: 404 });
}
