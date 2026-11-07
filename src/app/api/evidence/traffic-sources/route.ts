import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { addTrafficSource, type TrafficSourceInput } from "@/lib/evidence/ledger";
import { evidenceError, jsonObject } from "@/lib/evidence/route-helpers";

// Where a spike came from, in the seller's words. Stored as data; the URL is never fetched.
export async function POST(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const body = await jsonObject(request);
  if (body instanceof Response) return body;
  try {
    const { label, url, date, simulated } = body as unknown as TrafficSourceInput;
    const e = await addTrafficSource(getDb(), sellerId, { label, url, date, simulated });
    return Response.json({ id: e.id, summary: e.summary }, { status: 201 });
  } catch (err) {
    return evidenceError(err, "traffic source");
  }
}
