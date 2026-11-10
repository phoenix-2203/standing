import { getDb } from "@/db";
import { sessionSeller, unauthorized } from "@/lib/auth/session";
import { createLaunchPlan, InvalidLaunchPlan, type LaunchPlanInput, planPackStatus } from "@/lib/launch/plan";
import { spendAllowance } from "@/lib/demo/workspace";
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
  // A launch plan checks products with the AI and pre-builds a pack, so in a demo it uses a pack allowance.
  if (!(await spendAllowance(getDb(), sellerId, "packs"))) {
    return Response.json({ error: "This demo has used its AI checks for now. Log in with PayPal to keep planning." }, { status: 429 });
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
