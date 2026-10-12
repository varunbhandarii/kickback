import { createOrder, createOrderSchema } from "@/lib/paypal/orders";
import { signOrderToken } from "@/lib/crypto/order-token";
import { apiError, requireOrigin, requireSandboxTools } from "@/lib/http";
import { createPayment, payInput } from "@/lib/payments/create";
import { allowRequest, clientIp, limited } from "@/lib/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = requireOrigin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    if (typeof body.slug === "string") {
      const input = payInput.parse(body);
      if (!allowRequest(`create:${clientIp(request)}:${input.slug}`,20) || !allowRequest(`merchant:${input.slug}`,120)) return limited();
      const result = await createPayment(input);
      return Response.json({ orderId: result.order.id,orderToken: signOrderToken({ orderId: result.order.id,merchant: result.merchant.id,slug: result.merchant.slug,requestId: input.requestId,wallet: input.wallet,amountCents: result.amountCents }) },{ headers: { "Cache-Control": "no-store" } });
    }
    const legacyDenied = requireSandboxTools(request); if (legacyDenied) return legacyDenied;
    if (!allowRequest(`create:${clientIp(request)}:legacy`,20)) return limited();
    const input = createOrderSchema.parse(body);
    const order = await createOrder(input);
    return Response.json({ orderId: order.id, orderToken: signOrderToken({ orderId: order.id, merchant: input.merchant, requestId: input.requestId }) });
  } catch (error) { return apiError(error); }
}
