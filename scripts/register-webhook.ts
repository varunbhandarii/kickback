import "dotenv/config";
import { createPayPalClient,paypalFetch } from "../src/lib/paypal/client";
import { getEnv } from "../src/lib/env";
import { webhookEventTypes } from "../src/lib/paypal/events";
const origin = process.argv[2] ?? process.env.APP_URL;
if (!origin || new URL(origin).protocol !== "https:") throw new Error("Usage: npm run webhook:register -- https://your-app.onrender.com");
const url = new URL("/api/paypal/webhook", origin).href;
const ownedFlag = process.argv.indexOf("--merchant-owned"), owned = ownedFlag === -1 ? undefined : process.argv[ownedFlag+1];
if (ownedFlag !== -1 && !/^(rosas|salon|bakery)$/.test(owned ?? "")) throw new Error("--merchant-owned requires rosas, salon, or bakery");
const prefix = owned?.toUpperCase(), clientId = prefix ? process.env[`MERCHANT_${prefix}_CLIENT_ID`] : undefined, clientSecret = prefix ? process.env[`MERCHANT_${prefix}_CLIENT_SECRET`] : undefined;
if (owned && (!clientId || !clientSecret)) throw new Error("Set the merchant's local app credentials");
const request = owned ? createPayPalClient({ clientId: clientId!,clientSecret: clientSecret!,environment: getEnv().KICKBACK_ENV }).request : paypalFetch;
type Webhook = { id: string; url: string; event_types: { name: string }[] };
const { webhooks = [] } = await request<{ webhooks: Webhook[] }>("/v1/notifications/webhooks");
const existing = webhooks.find((w) => w.url === url);
if (existing) {
  const missing = webhookEventTypes.filter((name) => !existing.event_types.some((t) => t.name === name || t.name === "*"));
  if (missing.length) {
    await request(`/v1/notifications/webhooks/${existing.id}`, { method: "PATCH", body: [{ op: "replace", path: "/event_types", value: webhookEventTypes.map((name) => ({ name })) }] });
  }
  console.info(JSON.stringify({ id: existing.id, url, reused: true, updated: missing.length > 0 }));
} else {
  if (webhooks.length >= 10) throw new Error("App already has 10 webhooks; remove an unused one in the developer dashboard");
  const webhook = await request<Webhook>("/v1/notifications/webhooks", { method: "POST", body: { url, event_types: webhookEventTypes.map((name) => ({ name })) } });
  console.info(JSON.stringify({ id: webhook.id, url }));
}
