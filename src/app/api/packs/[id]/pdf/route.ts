import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { packs } from "@/db/schema";
import { renderPackPdf } from "@/lib/pack/pdf";

// Download a pack as PDF. Only validated (ready) packs export; a blocked pack answers 409 with the reasons.
export async function GET(_request: Request, ctx: RouteContext<"/api/packs/[id]/pdf">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "not_found" }, { status: 404 });
  const [pack] = await getDb().select().from(packs).where(eq(packs.id, id));
  if (!pack) return Response.json({ error: "not_found" }, { status: 404 });
  if (pack.status !== "ready") return Response.json({ error: "pack_not_ready", status: pack.status, problems: pack.validation?.problems ?? [] }, { status: 409 });
  const pdf = await renderPackPdf(pack);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="standing-pack-${pack.periodTo.toISOString().slice(0, 10)}.pdf"` },
  });
}
