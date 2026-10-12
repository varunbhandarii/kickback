import { z } from "zod";
import { createPayPalClient, getPayPalClient } from "./client";
import { getEnv } from "../env";
export const merchantName = z.enum(["platform", "rosas", "salon", "bakery"]);
export type MerchantName = z.infer<typeof merchantName>;
const prefixes = { rosas: "MERCHANT_ROSAS", salon: "MERCHANT_SALON", bakery: "MERCHANT_BAKERY" };
const clients = new Map<string, ReturnType<typeof createPayPalClient>>();
export function merchantContext(name: MerchantName) {
  const env = getEnv();
  if (name === "platform") return { client: getPayPalClient(), clientId: env.PAYPAL_CLIENT_ID, merchantId: undefined, assertionMerchantId: undefined };
  const prefix = prefixes[name];
  const merchantId = process.env[`${prefix}_ID`];
  if (!merchantId || !/^[A-Z0-9]{13}$/.test(merchantId)) throw new Error(`Set ${prefix}_ID to a valid merchant ID`);
  if (env.PAYPAL_CONNECTION_MODE === "partner") return { client: getPayPalClient(), clientId: env.PAYPAL_CLIENT_ID, merchantId, assertionMerchantId: merchantId };
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) throw new Error(`Set ${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET for BYO`);
  if (!clients.has(name)) clients.set(name, createPayPalClient({ clientId, clientSecret, environment: env.KICKBACK_ENV, bnCode: env.PAYPAL_BN_CODE as string | undefined }));
  return { client: clients.get(name)!, clientId, merchantId, assertionMerchantId: undefined };
}
