import "dotenv/config";
import { paypalFetch } from "../src/lib/paypal/client";
import { webhookEventTypes } from "../src/lib/paypal/events";
const origin = process.argv[2] ?? process.env.APP_URL;
if (!origin || new URL(origin).protocol !== "https:") throw new Error("Usage: npm run webhook:register -- https://your-app.onrender.com");
const url = new URL("/api/paypal/webhook", origin).href;
type Webhook = { id: string; url: string; event_types: { name: string }[] };
const { webhooks = [] } = await paypalFetch<{ webhooks: Webhook[] }>("/v1/notifications/webhooks");
const existing = webhooks.find((w) => w.url === url);
if (existing) {
  const missing = webhookEventTypes.filter((name) => !existing.event_types.some((t) => t.name === name || t.name === "*"));
  if (missing.length) {
    await paypalFetch(`/v1/notifications/webhooks/${existing.id}`, { method: "PATCH", body: [{ op: "replace", path: "/event_types", value: webhookEventTypes.map((name) => ({ name })) }] });
  }
  console.info(JSON.stringify({ id: existing.id, url, reused: true, updated: missing.length > 0 }));
} else {
  if (webhooks.length >= 10) throw new Error("App already has 10 webhooks; remove an unused one in the developer dashboard");
  const webhook = await paypalFetch<Webhook>("/v1/notifications/webhooks", { method: "POST", body: { url, event_types: webhookEventTypes.map((name) => ({ name })) } });
  console.info(JSON.stringify({ id: webhook.id, url }));
}
