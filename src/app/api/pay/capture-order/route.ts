import { z } from "zod";
import { verifyOrderToken } from "@/lib/crypto/order-token";
import { merchantContext } from "@/lib/paypal/merchants";
import { captureSummary, type Order } from "@/lib/paypal/orders";
import { apiError, requireSandboxTools } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = requireSandboxTools(request);
  if (denied) return denied;
  try {
    const { orderId, orderToken } = z.object({ orderId: z.string().regex(/^[A-Z0-9]{10,32}$/), orderToken: z.string().max(2048) }).parse(await request.json());
    let context;
    try { context = verifyOrderToken(orderToken); } catch { return Response.json({ error: "Invalid or expired order token" }, { status: 400 }); }
    if (context.orderId !== orderId) return Response.json({ error: "Order context mismatch" }, { status: 400 });
    const ctx = merchantContext(context.merchant);
    const order = await ctx.client.request<Order>(`/v2/checkout/orders/${context.orderId}/capture`, {
      method: "POST", requestId: context.requestId, merchantId: ctx.assertionMerchantId,
    });
    return Response.json(captureSummary(order), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
