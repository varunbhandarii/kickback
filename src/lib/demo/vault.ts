import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { demoBuyers, settings } from "@/db/schema";
import { getEnv } from "../env";
import { connectionContext, loadMerchant } from "../merchants";
import { upsertBuyer } from "./buyers";
type SetupToken = {
  id: string;
  status: string;
  links?: { rel: string; href: string }[];
  payment_source?: { paypal?: { email_address?: string } };
};
type PaymentToken = {
  id: string;
  payment_source?: { paypal?: { email_address?: string; usage_type?: string } };
};
const setupKey = (slot: number) => `demo-buyer-setup:${slot}`;
async function shop(slot: number) {
  const [buyer] = await getDb().select().from(demoBuyers).where(eq(demoBuyers.slot, slot));
  if (!buyer) throw new Error("Register the buyer first");
  const merchant = await loadMerchant(buyer.merchantSlug);
  if (!merchant) throw new Error("Demo business is not taking payments");
  // Partner connections act on the business's behalf; BYO uses its own app.
  const ctx = await connectionContext(merchant.id);
  return { buyer, merchant, ctx };
}
/**
 * Step 1: a merchant-scoped setup token. The buyer approves the returned link
 * once, signed in to sandbox PayPal as that buyer.
 */
export async function startBuyerVault(slot: number) {
  const { merchant, ctx } = await shop(slot);
  const back = new URL("/demo", getEnv().APP_URL).href;
  const setup = await ctx.client.request<SetupToken>("/v3/vault/setup-tokens", {
    method: "POST",
    merchantId: ctx.assertionMerchantId,
    requestId: randomUUID(),
    priority: "low",
    body: {
      payment_source: {
        paypal: {
          usage_type: "MERCHANT",
          description: `${merchant.displayName} sandbox demo`,
          experience_context: {
            brand_name: merchant.displayName,
            shipping_preference: "NO_SHIPPING",
            return_url: back,
            cancel_url: back,
          },
        },
      },
    },
  });
  const approveUrl = setup.links?.find((l) => l.rel === "approve")?.href;
  if (!approveUrl) throw new Error("PayPal returned no approval link");
  const value = { setupId: setup.id, requestId: randomUUID() };
  await getDb()
    .insert(settings)
    .values({ key: setupKey(slot), value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  return { slot, status: setup.status, approveUrl };
}
/** Step 2: turn the approved setup token into a saved wallet and store it encrypted. */
export async function finishBuyerVault(slot: number) {
  const { buyer, ctx } = await shop(slot);
  const [row] = await getDb().select().from(settings).where(eq(settings.key, setupKey(slot)));
  const saved = row?.value as { setupId: string; requestId: string } | undefined;
  if (!saved) throw new Error("Start the wallet setup first");
  const setup = await ctx.client.request<SetupToken>(`/v3/vault/setup-tokens/${saved.setupId}`, {
    merchantId: ctx.assertionMerchantId,
    priority: "low",
  });
  if (setup.status !== "APPROVED" && setup.status !== "VAULTED")
    return { slot, status: setup.status, saved: false };
  const approvedBy = setup.payment_source?.paypal?.email_address;
  if (approvedBy && approvedBy.toLowerCase() !== buyer.email)
    throw new Error("The wallet was approved by a different sandbox buyer");
  const token = await ctx.client.request<PaymentToken>("/v3/vault/payment-tokens", {
    method: "POST",
    merchantId: ctx.assertionMerchantId,
    requestId: saved.requestId,
    priority: "low",
    body: { payment_source: { token: { id: saved.setupId, type: "SETUP_TOKEN" } } },
  });
  const paypal = token.payment_source?.paypal;
  if (!token.id || (paypal?.usage_type && paypal.usage_type !== "MERCHANT"))
    throw new Error("PayPal did not return a merchant-scoped saved wallet");
  if (paypal?.email_address && paypal.email_address.toLowerCase() !== buyer.email)
    throw new Error("The saved wallet belongs to a different sandbox buyer");
  const result = await upsertBuyer(
    {
      slot,
      merchantSlug: buyer.merchantSlug,
      email: buyer.email,
      purpose: buyer.purpose as "pay" | "watch",
      published: buyer.published,
    },
    token.id,
  );
  await getDb().delete(settings).where(eq(settings.key, setupKey(slot)));
  return { slot, status: "VAULTED", saved: true, buyer: result };
}
