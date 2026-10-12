import { handleWebhook, webhookDependencies } from "@/lib/paypal/webhooks";
import { after } from "next/server";
import { getEnv } from "@/lib/env";
import { settleAfterDispatch } from "@/lib/webhooks/dispatch";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const response = await handleWebhook(request, webhookDependencies());
  if (response.ok && getEnv().REWARD_SETTLE_IMMEDIATE) after(() => settleAfterDispatch().catch(() => console.error(JSON.stringify({ action: "webhook_settlement_retry_pending" }))));
  return response;
}
