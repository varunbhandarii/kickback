import { createOrder, createOrderSchema } from "@/lib/paypal/orders";
import { signOrderToken } from "@/lib/crypto/order-token";
import { apiError, requireSandboxTools } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = requireSandboxTools(request);
  if (denied) return denied;
  try {
    const input = createOrderSchema.parse(await request.json());
    const order = await createOrder(input);
    return Response.json({ orderId: order.id, orderToken: signOrderToken({ orderId: order.id, merchant: input.merchant, requestId: input.requestId }) });
  } catch (error) { return apiError(error); }
}
