import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { packDetail } from "@/lib/ui/data";

export async function GET(request: Request, ctx: RouteContext<"/api/packs/[id]">) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const { id } = await ctx.params;
  const pack = await packDetail(getDb(), sellerId, id);
  return pack ? Response.json(pack) : Response.json({ error: "not_found" }, { status: 404 });
}
