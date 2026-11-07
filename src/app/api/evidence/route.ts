import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { sellerEvidence } from "@/lib/evidence/ledger";

// What the seller added themselves. Summaries are written by code (ledger.ts), never by the AI.
export async function GET(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const items = await sellerEvidence(getDb(), sellerId);
  return Response.json({
    items: items.map((e) => ({ id: e.id, kind: e.kind, occurredAt: e.occurredAt.toISOString(), summary: e.summary, simulated: e.simulated })),
  });
}
