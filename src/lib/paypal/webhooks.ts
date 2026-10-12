import { z } from "zod";
import { getEnv } from "../env";
import { paypalFetch } from "./client";
import { getDb } from "@/db";
import { rawEvents, webhookEvents } from "@/db/schema";
import { verifyLocal } from "./local-verification";

const eventSchema = z.object({
  id: z.string().min(1).max(255), event_type: z.string().min(1).max(255),
  resource: z.record(z.string(), z.unknown()).optional(),
}).passthrough();
export type WebhookEvent = z.infer<typeof eventSchema>;
type Dependencies = {
  webhookId?: string;
  allowUnverified: boolean;
  verify: (body: unknown) => Promise<{ verification_status: string }>;
  persist: (event: WebhookEvent) => Promise<boolean>;
  log: (summary: Record<string, unknown>) => void;
  dispatch?: (event: WebhookEvent) => Promise<unknown>;
  localVerify?: (raw: string, headers: Headers, webhookId: string) => Promise<boolean>;
};

export async function persistWebhook(event: WebhookEvent) {
  return getDb().transaction(async (tx) => {
    const inserted = await tx.insert(webhookEvents).values({ eventId: event.id, eventType: event.event_type }).onConflictDoNothing().returning({ eventId: webhookEvents.eventId });
    if (!inserted.length) return false;
    await tx.insert(rawEvents).values({ kind: event.event_type, payload: event, purgeAfter: new Date(Date.now() + 47 * 60 * 60 * 1000) });
    return true;
  });
}

export async function handleWebhook(request: Request, deps: Dependencies) {
  if (Number(request.headers.get("content-length")) > 1024 * 1024) return Response.json({ error: "Body too large" }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 1024 * 1024) return Response.json({ error: "Body too large" }, { status: 413 });
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const checked = eventSchema.safeParse(parsed);
  if (!checked.success) return Response.json({ error: "Invalid event" }, { status: 400 });
  const headers = {
    auth_algo: request.headers.get("paypal-auth-algo"),
    cert_url: request.headers.get("paypal-cert-url"),
    transmission_id: request.headers.get("paypal-transmission-id"),
    transmission_sig: request.headers.get("paypal-transmission-sig"),
    transmission_time: request.headers.get("paypal-transmission-time"),
  };
  let verified = false;
  if (deps.webhookId && Object.values(headers).every(Boolean)) {
    try {
      if (deps.localVerify) { try { verified = await deps.localVerify(raw,request.headers,deps.webhookId); } catch { /* PayPal postback is the fallback for certificate outages. */ } }
      if (!verified) { const result = await deps.verify({ ...headers, webhook_id: deps.webhookId, webhook_event: parsed }); verified = result.verification_status === "SUCCESS"; }
    } catch {
      return Response.json({ error: "Verification unavailable" }, { status: 503 });
    }
  }
  if (!verified && !deps.allowUnverified) return Response.json({ error: "Signature verification failed" }, { status: 400 });
  try {
    const inserted = await deps.persist(checked.data);
    deps.log({ event_type: checked.data.event_type, event_id: checked.data.id, resource_id: checked.data.resource?.id, resource_status: checked.data.resource?.status, verification_status: verified ? "SUCCESS" : "BYPASSED", duplicate: !inserted });
    if (inserted && deps.dispatch) { try { await deps.dispatch(checked.data); } catch { deps.log({ event_id: checked.data.id,action: "dispatch_retry_pending" }); } }
    return Response.json({ ok: true, duplicate: !inserted });
  } catch {
    return Response.json({ error: "Storage unavailable" }, { status: 503 });
  }
}

export function webhookDependencies(): Dependencies {
  const env = getEnv();
  return {
    webhookId: env.PAYPAL_WEBHOOK_ID as string | undefined,
    localVerify: verifyLocal,
    allowUnverified: env.KICKBACK_ENV === "sandbox" && env.KICKBACK_ALLOW_UNVERIFIED_WEBHOOKS,
    verify: (body) => paypalFetch("/v1/notifications/verify-webhook-signature", { method: "POST", body, priority: "high" }),
    persist: persistWebhook,
    dispatch: async (event) => (await import("../webhooks/dispatch")).dispatch(event),
    log: (summary) => console.info(JSON.stringify(summary)),
  };
}
