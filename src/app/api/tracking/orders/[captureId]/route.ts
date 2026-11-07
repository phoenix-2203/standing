import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { addTracking, InvalidTracking, NotATrackingGap, type TrackingInput } from "@/lib/fixes/tracking";

// The seller typed a tracking number: previews and approves it, and the cancel window starts now.
export async function POST(request: Request, ctx: RouteContext<"/api/tracking/orders/[captureId]">) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const { captureId } = await ctx.params;
  let input: TrackingInput | null;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof input !== "object" || input === null) return Response.json({ error: "invalid_json" }, { status: 400 });
  try {
    const a = await addTracking(getDb(), sellerId, captureId, input);
    return Response.json({ requestId: a.requestId, status: a.status, summary: a.summary, undoUntil: a.undoUntil });
  } catch (err) {
    if (err instanceof NotATrackingGap) return Response.json({ error: err.message }, { status: 404 });
    if (err instanceof InvalidTracking) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
