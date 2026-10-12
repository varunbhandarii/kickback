import { handleWebhook, webhookDependencies } from "@/lib/paypal/webhooks";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleWebhook(request, webhookDependencies());
}
