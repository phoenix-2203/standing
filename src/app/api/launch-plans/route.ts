import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { createLaunchPlan, InvalidLaunchPlan, type LaunchPlanInput, planPackStatus } from "@/lib/launch/plan";
import { providersFromEnv } from "@/lib/llm/providers";

export async function POST(request: Request) {
  const sellerId = sessionSeller(request);
  if (!sellerId) return unauthorized();
  let input: LaunchPlanInput;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const db = getDb();
    const plan = await createLaunchPlan(db, sellerId, input, providersFromEnv());
    const packStatus = await planPackStatus(db, plan.packId);
    return Response.json({ id: plan.id, launchDate: plan.launchDate, expectedMultiple: Number(plan.expectedMultiple), policy: plan.policy, packId: plan.packId, packStatus }, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidLaunchPlan) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
