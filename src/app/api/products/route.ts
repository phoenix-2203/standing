import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { catalogueView, InvalidProduct, type ProductInput, saveProduct } from "@/lib/catalogue/catalogue";

export async function GET(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  return Response.json(await catalogueView(getDb(), sellerId));
}

export async function POST(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  let input: ProductInput | null;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof input !== "object" || input === null) return Response.json({ error: "invalid_json" }, { status: 400 });
  try {
    const p = await saveProduct(getDb(), sellerId, input);
    return Response.json({ id: p.id, name: p.name, sku: p.sku, kind: p.kind, category: p.category }, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidProduct) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
