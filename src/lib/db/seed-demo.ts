import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections, merchants, programs, type MenuItem } from "@/db/schema";
import { encryptSecret } from "../crypto/tenant";
import { defaultProgram, loadProgram } from "../engine/program";
import { getEnv } from "../env";
const demos = [
  { slug: "rosas", prefix: "ROSAS", name: "Rosa's Cafe", menu: [{ id: "drip", name: "Drip coffee", priceCents: 365 },{ id: "latte", name: "Latte", priceCents: 550 },{ id: "cold-brew", name: "Cold brew", priceCents: 558 },{ id: "pastry", name: "Pastry", priceCents: 425 }], spec: defaultProgram },
  { slug: "salon", prefix: "SALON", name: "Bright Salon", menu: [{ id: "cut", name: "Haircut", priceCents: 3500 },{ id: "style", name: "Styling", priceCents: 2500 },{ id: "treatment", name: "Treatment", priceCents: 4000 },{ id: "trim", name: "Trim", priceCents: 2000 }], spec: { ...defaultProgram, n: 4, rewardCents: 500, windowDays: 120, minTicketCents: 2000 } },
  { slug: "bakery", prefix: "BAKERY", name: "Loaf Bakery", menu: [{ id: "loaf", name: "Sourdough loaf", priceCents: 850 },{ id: "croissant", name: "Croissant", priceCents: 450 },{ id: "bagel", name: "Bagel", priceCents: 350 },{ id: "cake", name: "Cake slice", priceCents: 650 }], spec: { ...defaultProgram, type: "SPEND_MILESTONE", spendCents: 4000, rewardCents: 300, windowDays: 45, noteTemplate: "Thanks for {n}, this one's on {merchant}" } },
];
export async function seedDemo() {
  const env = getEnv(), seeded: string[] = [];
  for (const demo of demos) {
    const id = process.env[`MERCHANT_${demo.prefix}_ID`];
    if (!id || !/^[A-Z0-9]{13}$/.test(id)) throw new Error(`Set MERCHANT_${demo.prefix}_ID`);
    const mode = (process.env[`MERCHANT_${demo.prefix}_CONNECTION_MODE`] ?? env.PAYPAL_CONNECTION_MODE).toUpperCase() as "PARTNER" | "BYO";
    if (mode !== "PARTNER" && mode !== "BYO") throw new Error("Invalid connection mode");
    const clientId = process.env[`MERCHANT_${demo.prefix}_CLIENT_ID`], secret = process.env[`MERCHANT_${demo.prefix}_CLIENT_SECRET`];
    if (mode === "BYO" && (!clientId || !secret)) throw new Error(`Set MERCHANT_${demo.prefix} REST credentials`);
    const spec = loadProgram(demo.spec);
    await getDb().transaction(async (tx) => {
      const [merchant] = await tx.insert(merchants).values({ slug: demo.slug, displayName: demo.name, menu: demo.menu as MenuItem[] }).onConflictDoUpdate({ target: merchants.slug, set: { displayName: demo.name, menu: demo.menu as MenuItem[] } }).returning();
      const [old] = await tx.select().from(connections).where(eq(connections.merchantId,merchant.id));
      const value = { merchantId: merchant.id, merchantIdInPayPal: id, mode, clientId: mode === "BYO" ? clientId : null, clientSecretEnc: mode === "BYO" ? encryptSecret(secret!) : null, grantedFeatures: ["PAYMENT","REFUND","ADVANCED_TRANSACTIONS_SEARCH","ACCESS_MERCHANT_INFORMATION"], consentStatus: old?.consentStatus ?? "UNKNOWN", webhookId: mode === "PARTNER" ? env.PAYPAL_WEBHOOK_ID as string | undefined : process.env[`MERCHANT_${demo.prefix}_WEBHOOK_ID`], updatedAt: new Date() };
      await tx.insert(connections).values(value).onConflictDoUpdate({ target: connections.merchantId, set: value });
      await tx.insert(programs).values({ merchantId: merchant.id, version: 1, status: "ACTIVE", spec, provenance: { source: "demo-seed" } }).onConflictDoNothing();
    });
    seeded.push(demo.slug);
  }
  return { seeded };
}
