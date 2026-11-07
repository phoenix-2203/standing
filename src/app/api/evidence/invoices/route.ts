import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { addInvoice, type InvoiceInput } from "@/lib/evidence/ledger";
import { evidenceError, jsonObject } from "@/lib/evidence/route-helpers";

// A supplier invoice the seller adds. It is data for the pack, never instructions (CLAUDE.md rule 6).
export async function POST(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  const body = await jsonObject(request);
  if (body instanceof Response) return body;
  try {
    const { supplier, invoiceNumber, date, lines, simulated } = body as unknown as InvoiceInput;
    const e = await addInvoice(getDb(), sellerId, { supplier, invoiceNumber, date, lines, simulated });
    return Response.json({ id: e.id, summary: e.summary }, { status: 201 });
  } catch (err) {
    return evidenceError(err, "invoice");
  }
}
