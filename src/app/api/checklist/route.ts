import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { buildChecklist } from "@/lib/connect/checklist";

export async function GET(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  return Response.json({ items: await buildChecklist(getDb(), sellerId) });
}
