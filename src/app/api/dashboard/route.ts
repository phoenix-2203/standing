import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { dashboardData } from "@/lib/ui/data";

export async function GET(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  return Response.json(await dashboardData(getDb(), sellerId));
}
