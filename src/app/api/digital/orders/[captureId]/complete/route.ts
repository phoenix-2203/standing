import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { completeOrder, NotAGap } from "@/lib/digital/module";

// One click: previews and approves "marks the order Completed"; the cancel window starts now.
export async function POST(request: Request, ctx: RouteContext<"/api/digital/orders/[captureId]/complete">) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const { captureId } = await ctx.params;
  try {
    const a = await completeOrder(getDb(), sellerId, captureId);
    return Response.json({ requestId: a.requestId, status: a.status, summary: a.summary, undoUntil: a.undoUntil });
  } catch (err) {
    if (err instanceof NotAGap) return Response.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
