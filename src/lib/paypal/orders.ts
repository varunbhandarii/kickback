import { z } from "zod";
import { merchantContext, merchantName } from "./merchants";
export const amountSchema = z.string().regex(/^\d{1,3}\.\d{2}$/).refine((v) => Number(v) >= 1 && Number(v) <= 500, "Amount must be $1–$500");
export const createOrderSchema = z.object({ merchant: merchantName.default("platform"), amount: amountSchema.default("10.00"), requestId: z.uuid() });
export type Order = {
  id: string; status: string;
  payment_source?: { paypal?: { account_id?: string }; venmo?: { account_id?: string; user_name?: string } };
  purchase_units?: { payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[] } }[];
};
export async function createOrder(input: z.infer<typeof createOrderSchema>) {
  const ctx = merchantContext(input.merchant);
  return ctx.client.request<Order>("/v2/checkout/orders", {
    method: "POST", requestId: input.requestId, merchantId: ctx.assertionMerchantId,
    body: { intent: "CAPTURE", purchase_units: [{ amount: { currency_code: "USD", value: input.amount },
      ...(ctx.assertionMerchantId ? { payee: { merchant_id: ctx.merchantId } } : {}),
      custom_id: `KICKBACK:${input.merchant}:${input.requestId}` }],
      payment_source: undefined },
  });
}
export function captureSummary(order: Order) {
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  const wallet = order.payment_source?.venmo ? "venmo" : "paypal";
  return { orderId: order.id, orderStatus: order.status, captureId: capture?.id, captureStatus: capture?.status,
    amount: capture?.amount, wallet, accountId: order.payment_source?.[wallet]?.account_id,
    venmoUserName: order.payment_source?.venmo?.user_name };
}
