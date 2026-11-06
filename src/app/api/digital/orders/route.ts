import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { listDigitalGaps } from "@/lib/digital/module";

export async function GET(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  return Response.json({ orders: await listDigitalGaps(getDb(), sellerId) });
}
