import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { spendAllowance } from "@/lib/demo/workspace";
import { providersFromEnv } from "@/lib/llm/providers";
import { buildPack } from "@/lib/pack/build";
import { packList } from "@/lib/ui/data";

export async function GET(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  return Response.json({ packs: await packList(getDb(), sellerId) });
}

// Build a new pack now. The validator decides ready/blocked; a blocked pack has no letter and can't be exported.
export async function POST(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  if (!(await spendAllowance(getDb(), sellerId, "packs"))) {
    return Response.json({ error: "This demo has built its packs for now. Open one of the packs you built, or log in with PayPal." }, { status: 429 });
  }
  try {
    const pack = await buildPack(getDb(), sellerId, providersFromEnv());
    return Response.json({ id: pack.id, status: pack.status }, { status: 201 });
  } catch (err) {
    console.error(`Pack build failed: ${(err as Error).message.slice(0, 200)}`);
    return Response.json({ error: "The pack couldn't be built right now. Please try again in a minute." }, { status: 503 });
  }
}
