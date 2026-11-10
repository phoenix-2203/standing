import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { heldData } from "@/lib/held/held";

// The "money already held" checklist. Read-only: every step links to the existing safe flow that does it.
export async function GET(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  return Response.json(await heldData(getDb(), sellerId));
}
