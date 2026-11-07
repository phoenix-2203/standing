import { InvalidEvidence } from "./ledger";

/** Parse a JSON object body, or return the 400 to send. */
export async function jsonObject(request: Request): Promise<Record<string, unknown> | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body must be JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "The request body must be a JSON object." }, { status: 400 });
  return body as Record<string, unknown>;
}

/** Seller mistakes come back with their message; anything else is logged briefly and answered generically. */
export function evidenceError(err: unknown, what: string): Response {
  if (err instanceof InvalidEvidence) return Response.json({ error: err.message }, { status: 400 });
  console.error(`${what} failed: ${(err as Error).message.slice(0, 200)}`);
  return Response.json({ error: `The ${what} couldn't be saved right now. Please try again.` }, { status: 500 });
}
