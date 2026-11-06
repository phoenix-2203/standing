import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { orderRows } from "@/lib/ui/data";

export async function GET(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  return Response.json({ rows: await orderRows(getDb(), sellerId) });
}
