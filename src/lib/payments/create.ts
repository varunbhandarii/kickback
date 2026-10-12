import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { orders, settings } from "@/db/schema";
import { getEnv } from "../env";
import { connectionContext, loadMerchant } from "../merchants";
import type { CaptureOrder } from "../ledger/record-capture";
export const payInput = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,64}$/), wallet: z.enum(["paypal","venmo"]), itemId: z.string().max(64).optional(), amountCents: z.number().int().min(100).max(50000).optional(), requestId: z.uuid() }).refine((v) => v.itemId || v.amountCents !== undefined,"Choose an item or amount");
export class PaymentInputError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export async function createPayment(input: z.infer<typeof payInput>, vaultId?: string, demoVisitAt?: Date) {
  if (demoVisitAt && (getEnv().KICKBACK_ENV !== "sandbox" || !getEnv().DEMO_MODE)) throw new Error("Historical demo clock is sandbox only");
  const merchant = await loadMerchant(input.slug);
  if (!merchant) throw new PaymentInputError("Merchant not found",404);
  if (merchant.status !== "ACTIVE") throw new PaymentInputError("Payments are paused",409);
  const ctx = await connectionContext(merchant.id);
  if (ctx.connection.consentStatus === "REVOKED") throw new PaymentInputError("Merchant connection is unavailable",409);
  const item = input.itemId ? merchant.menu.find((v) => v.id === input.itemId) : undefined;
  if (input.itemId && !item) throw new PaymentInputError("Menu item not found");
  const amountCents = item?.priceCents ?? input.amountCents!;
  if (!Number.isSafeInteger(amountCents) || amountCents < 100 || amountCents > 50000) throw new PaymentInputError("Choose an amount from $1 to $500");
  const fingerprint = createHash("sha256").update(JSON.stringify({ wallet: input.wallet,amountCents,itemId: item?.id ?? null })).digest("hex");
  const key = `order:${merchant.id}:${input.requestId}`;
  await getDb().insert(settings).values({ key,value: { fingerprint } }).onConflictDoNothing();
  const [intent] = await getDb().select().from(settings).where(eq(settings.key,key));
  if ((intent.value as { fingerprint: string }).fingerprint !== fingerprint) throw new PaymentInputError("Request ID was already used for a different purchase",409);
  const [existing] = await getDb().select().from(orders).where(and(eq(orders.merchantId,merchant.id),eq(orders.requestId,input.requestId)));
  if (existing && !vaultId) return { merchant,ctx,amountCents,wallet: input.wallet,order: { id: existing.id,status: existing.status } as CaptureOrder };
  const env = getEnv(), experience = { brand_name: merchant.displayName, user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", ...(input.wallet === "paypal" ? { payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",return_url: new URL(`/pay/${merchant.slug}`,env.APP_URL).href,cancel_url: new URL(`/pay/${merchant.slug}`,env.APP_URL).href } : {}) };
  const value = (amountCents/100).toFixed(2);
  const unit = { amount: { currency_code: "USD",value,...(item ? { breakdown: { item_total: { currency_code: "USD",value } } } : {}) }, ...(ctx.assertionMerchantId ? { payee: { merchant_id: ctx.connection.merchantIdInPayPal } } : {}), custom_id: `KICKBACK:${merchant.id}:${input.requestId}`,description: merchant.displayName,...(item ? { items: [{ name: item.name,quantity: "1",unit_amount: { currency_code: "USD",value } }] } : {}) };
  const order = await ctx.client.request<CaptureOrder>("/v2/checkout/orders",{ method: "POST",merchantId: ctx.assertionMerchantId,requestId: input.requestId,priority: vaultId ? "low" : "normal",body: { intent: "CAPTURE",purchase_units: [unit],payment_source: { [input.wallet]: { experience_context: experience,...(vaultId ? { vault_id: vaultId } : {}) } } } });
  const [created] = await getDb().insert(orders).values({ id: order.id,merchantId: merchant.id,requestId: input.requestId,wallet: input.wallet === "venmo" ? "VENMO" : "PAYPAL",amountCents,itemId: item?.id,status: order.status,demoVisitAt }).onConflictDoNothing().returning();
  if (!created) { const [same] = await getDb().select().from(orders).where(eq(orders.id,order.id)); if (!same || same.merchantId !== merchant.id || same.requestId !== input.requestId) throw new Error("Order persistence conflict"); }
  return { merchant,ctx,amountCents,wallet: input.wallet,order };
}
