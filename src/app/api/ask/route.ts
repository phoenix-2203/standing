import { getDb } from "@/db";
import { askStanding } from "@/lib/ask/ask";
import { loadAskFacts } from "@/lib/ask/context";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { providersFromEnv } from "@/lib/llm/providers";

export async function POST(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  let question: unknown;
  try {
    question = ((await request.json()) as { question?: unknown }).question;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const r = await askStanding(typeof question === "string" ? question : "", await loadAskFacts(getDb(), sellerId), providersFromEnv());
    return Response.json({ decision: r.decision, refusalTopic: r.refusalTopic, text: r.text, sentences: r.sentences });
  } catch (err) {
    console.error(`Ask Standing failed: ${(err as Error).message.slice(0, 300)}`);
    return Response.json({ error: "Standing couldn't answer right now. Please try again in a minute." }, { status: 503 });
  }
}
