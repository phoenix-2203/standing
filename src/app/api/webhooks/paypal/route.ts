import { getDb } from "@/db";
import { paypalFromEnv } from "@/lib/paypal/client";
import { handlePayPalWebhook } from "@/lib/webhooks/paypal";

export async function POST(request: Request) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return Response.json({ error: "PAYPAL_WEBHOOK_ID is not set" }, { status: 500 });
  return handlePayPalWebhook(request, { db: getDb(), paypal: paypalFromEnv(), webhookId });
}
