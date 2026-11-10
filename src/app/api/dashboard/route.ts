import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { DEMO_TTL_HOURS, isDemoSeller, LIMITS } from "@/lib/demo/workspace";
import { demoWorkspaces } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dashboardData } from "@/lib/ui/data";

export async function GET(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const db = getDb();
  const data = await dashboardData(db, sellerId);
  if (!isDemoSeller(sellerId)) return Response.json({ ...data, demo: null });
  const [w] = await db
    .select()
    .from(demoWorkspaces)
    .where(eq(demoWorkspaces.sellerId, sellerId));
  const demo = w
    ? {
        expiresAt: new Date(
          w.createdAt.getTime() + DEMO_TTL_HOURS * 3_600_000,
        ).toISOString(),
        asksLeft: Math.max(0, LIMITS.asks - w.asks),
        packsLeft: Math.max(0, LIMITS.packs - w.packs),
      }
    : null;
  return Response.json({ ...data, demo });
}
