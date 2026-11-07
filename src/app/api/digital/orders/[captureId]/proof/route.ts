import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { addDeliveryProof, type DeliveryProofInput, InvalidProof, NotAGap } from "@/lib/digital/module";

export async function POST(request: Request, ctx: RouteContext<"/api/digital/orders/[captureId]/proof">) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const { captureId } = await ctx.params;
  let body: Omit<DeliveryProofInput, "transactionId" | "simulated">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body must be JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ error: "The request body must be a JSON object." }, { status: 400 });
  try {
    const e = await addDeliveryProof(getDb(), sellerId, { method: body.method, deliveredOn: body.deliveredOn, reference: body.reference, transactionId: captureId });
    return Response.json({ id: e.id, summary: e.summary }, { status: 201 });
  } catch (err) {
    if (err instanceof NotAGap) return Response.json({ error: err.message }, { status: 404 });
    if (err instanceof InvalidProof) return Response.json({ error: err.message }, { status: 400 });
    // Anything else (database, bug) is ours: log a short line, show a generic message, never the internals.
    console.error(`Delivery proof failed: ${(err as Error).message.slice(0, 200)}`);
    return Response.json({ error: "The proof couldn't be saved right now. Please try again." }, { status: 500 });
  }
}
