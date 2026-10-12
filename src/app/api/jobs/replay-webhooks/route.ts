import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { rawEvents,webhookEvents } from "@/db/schema";
import { validBearer,apiError } from "@/lib/http";
import { sandboxToolsEnabled } from "@/lib/env";
import { persistWebhook,type WebhookEvent } from "@/lib/paypal/webhooks";
import { dispatch } from "@/lib/webhooks/dispatch";
export async function POST(request: Request) {
  if (!sandboxToolsEnabled()) return Response.json({ error: "Not found" },{ status: 404 });
  if (!validBearer(request)) return Response.json({ error: "Unauthorized" },{ status: 401 });
  try {
    const { eventId } = z.object({ eventId: z.string().max(255) }).parse(await request.json());
    const [receipt] = await getDb().select().from(webhookEvents).where(eq(webhookEvents.eventId,eventId));
    const [raw] = await getDb().select().from(rawEvents).where(sql`${rawEvents.payload}->>'id' = ${eventId}`).limit(1);
    if (!receipt?.processedAt || !raw) return Response.json({ error: "Processed event unavailable" },{ status: 404 });
    const results = [];
    for (let n = 0; n < 5; n++) { const event = raw.payload as WebhookEvent; results.push({ duplicate: !await persistWebhook(event),...await dispatch(event) }); }
    return Response.json({ eventId,results });
  } catch (e) { return apiError(e); }
}
