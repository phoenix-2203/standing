import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { disputeRows } from "@/lib/disputes/respond";

export async function GET(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  return Response.json({ disputes: await disputeRows(getDb(), sellerId) });
}
