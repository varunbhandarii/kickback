import { z } from "zod";
import { getPayPalClient } from "./client";
import { getEnv } from "../env";
import { connectionContext, loadMerchant } from "../merchants";
export const merchantName = z.enum(["platform", "rosas", "salon", "bakery"]);
export type MerchantName = z.infer<typeof merchantName>;
export async function merchantContext(name: MerchantName) {
  const env = getEnv();
  if (name === "platform")
    return {
      client: getPayPalClient(),
      clientId: env.PAYPAL_CLIENT_ID,
      merchantId: undefined,
      assertionMerchantId: undefined,
    };
  const merchant = await loadMerchant(name);
  if (!merchant || merchant.status !== "ACTIVE" || merchant.purgeAfter)
    throw new Error("Merchant payments are unavailable");
  const ctx = await connectionContext(merchant.id);
  return { ...ctx, merchantId: ctx.connection.merchantIdInPayPal };
}
