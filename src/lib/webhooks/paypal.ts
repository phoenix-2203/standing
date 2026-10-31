import type { Db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { type PayPalClient, PayPalUnknownOutcome } from "@/lib/paypal/client";

const SIGNATURE_HEADERS = {
  transmissionId: "paypal-transmission-id",
  transmissionTime: "paypal-transmission-time",
  certUrl: "paypal-cert-url",
  authAlgo: "paypal-auth-algo",
  transmissionSig: "paypal-transmission-sig",
} as const;

export interface WebhookDeps {
  db: Db;
  paypal: PayPalClient;
  webhookId: string;
}

interface PayPalEvent {
  id: string;
  event_type: string;
  resource_type?: string;
}

/**
 * PayPal webhook receiver (CLAUDE.md rule 9).
 * 400 = malformed, signature rejected, or PayPal refused the verification request (nothing stored).
 * 503 = PayPal unreachable or 5xx while verifying, so PayPal redelivers. 200 = stored, or already seen (duplicate deliveries are ignored by event ID).
 */
export async function handlePayPalWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  const sig = Object.fromEntries(
    Object.entries(SIGNATURE_HEADERS).map(([key, header]) => [key, request.headers.get(header)]),
  ) as Record<keyof typeof SIGNATURE_HEADERS, string | null>;
  const missing = Object.entries(sig).filter(([, v]) => !v).map(([k]) => SIGNATURE_HEADERS[k as keyof typeof SIGNATURE_HEADERS]);
  if (missing.length) return reply(400, { error: "missing_signature_headers", missing });

  let event: PayPalEvent;
  try {
    event = JSON.parse(await request.text());
  } catch {
    return reply(400, { error: "invalid_json" });
  }
  if (typeof event?.id !== "string" || typeof event.event_type !== "string") {
    return reply(400, { error: "not_a_paypal_event" });
  }

  let verify;
  try {
    verify = await deps.paypal.request<{ verification_status?: string }>(
      "POST",
      "/v1/notifications/verify-webhook-signature",
      {
        body: {
          auth_algo: sig.authAlgo,
          cert_url: sig.certUrl,
          transmission_id: sig.transmissionId,
          transmission_sig: sig.transmissionSig,
          transmission_time: sig.transmissionTime,
          webhook_id: deps.webhookId,
          webhook_event: event,
        },
        // A read-only check, not a write: deliberately NOT stable. A stable ID (e.g. the transmission
        // ID) would let a forged body replayed under a real transmission ID get PayPal's cached SUCCESS.
        requestId: crypto.randomUUID(),
      },
    );
  } catch (err) {
    if (err instanceof PayPalUnknownOutcome) return reply(503, { error: "verification_unavailable" });
    throw err;
  }

  if (verify.status >= 500) return reply(503, { error: "verification_unavailable", debug_id: verify.debugId });
  if (verify.status !== 200) {
    // PayPal refused the verification request itself (bad webhook ID, malformed headers): it will
    // never verify on redelivery, so this is a rejection, not "try later".
    console.error(`PayPal webhook verification request rejected: HTTP ${verify.status} (debug ${verify.debugId})`);
    return reply(400, { error: "signature_unverifiable", debug_id: verify.debugId });
  }
  if (verify.body?.verification_status !== "SUCCESS") {
    return reply(400, { error: "signature_rejected", debug_id: verify.debugId });
  }

  const inserted = await deps.db
    .insert(webhookEvents)
    .values({
      eventId: event.id,
      eventType: event.event_type,
      resourceType: event.resource_type ?? null,
      transmissionId: sig.transmissionId!,
      verifyDebugId: verify.debugId,
      body: event,
    })
    .onConflictDoNothing({ target: webhookEvents.eventId })
    .returning({ eventId: webhookEvents.eventId });

  return reply(200, { status: inserted.length ? "stored" : "duplicate", event_id: event.id });
}

function reply(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}
