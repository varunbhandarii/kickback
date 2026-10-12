import { z } from "zod";
import { after } from "next/server";
import { verifyOrderToken } from "@/lib/crypto/order-token";
import { merchantContext, type MerchantName } from "@/lib/paypal/merchants";
import { captureSummary, type Order } from "@/lib/paypal/orders";
import { apiError, requireOrigin, requireSandboxTools } from "@/lib/http";
import { capturePayment } from "@/lib/payments/capture";
import { settleReward } from "@/lib/rewards/executor";
import { getEnv } from "@/lib/env";
import { allowRequest, clientIp, limited } from "@/lib/rate-limit";
import { PayPalApiError } from "@/lib/paypal/client";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = requireOrigin(request);
  if (denied) return denied;
  try {
    const { orderId, orderToken } = z.object({ orderId: z.string().regex(/^[A-Z0-9]{10,32}$/), orderToken: z.string().max(2048) }).parse(await request.json());
    let context;
    try { context = verifyOrderToken(orderToken); } catch { return Response.json({ error: "Invalid or expired order token" }, { status: 400 }); }
    if (context.orderId !== orderId) return Response.json({ error: "Order context mismatch" }, { status: 400 });
    if (!allowRequest(`capture:${clientIp(request)}`,30)) return limited();
    if (context.slug) {
      const { rewardIds,...result } = await capturePayment(context);
      if (getEnv().REWARD_SETTLE_IMMEDIATE && rewardIds.length) after(async () => { for (const id of rewardIds) { try { await settleReward(id,{ deadline: Date.now()+20000 }); } catch { console.error(JSON.stringify({ reward_id: id,action: "immediate_retry_pending" })); } } });
      return Response.json(result,{ headers: { "Cache-Control": "no-store" } });
    }
    const legacyDenied = requireSandboxTools(request); if (legacyDenied) return legacyDenied;
    if (!["platform","rosas","salon","bakery"].includes(context.merchant)) return Response.json({ error: "Invalid merchant" },{ status: 400 });
    const ctx = merchantContext(context.merchant as MerchantName);
    const order = await ctx.client.request<Order>(`/v2/checkout/orders/${context.orderId}/capture`, {
      method: "POST", requestId: context.requestId, merchantId: ctx.assertionMerchantId,
    });
    return Response.json(captureSummary(order), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PayPalApiError && error.details.some((d) => ["INSTRUMENT_DECLINED","PAYER_ACTION_REQUIRED","ORDER_NOT_APPROVED","ORDER_COMPLETION_IN_PROGRESS"].includes(d.issue ?? ""))) return Response.json({ error: error.details[0]?.issue,retryable: true,debug_id: error.debug_id },{ status: 422 });
    return apiError(error);
  }
}
