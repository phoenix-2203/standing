import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { addDeliveryProof, type DeliveryProofInput, NotAGap } from "@/lib/digital/module";

export async function POST(request: Request, ctx: RouteContext<"/api/digital/orders/[captureId]/proof">) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const { captureId } = await ctx.params;
  try {
    const body = (await request.json()) as Omit<DeliveryProofInput, "transactionId" | "simulated">;
    const e = await addDeliveryProof(getDb(), sellerId, { method: body.method, deliveredOn: body.deliveredOn, reference: body.reference, transactionId: captureId });
    return Response.json({ id: e.id, summary: e.summary }, { status: 201 });
  } catch (err) {
    if (err instanceof NotAGap) return Response.json({ error: err.message }, { status: 404 });
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
