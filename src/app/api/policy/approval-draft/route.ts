import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { approvalDraft, InvalidDraftRequest } from "@/lib/policy/approval";

// A pre-approval request the seller copies and sends themselves. Template only: no AI, nothing stored,
// nothing sent to PayPal.
export async function POST(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body must be JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ error: "The request body must be a JSON object." }, { status: 400 });
  try {
    const { name, description, clauseId } = body as Record<string, unknown>;
    return Response.json(approvalDraft({ name, description, clauseId }));
  } catch (err) {
    if (err instanceof InvalidDraftRequest) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
