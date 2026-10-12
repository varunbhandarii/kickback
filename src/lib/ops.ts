import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants, settings } from "@/db/schema";
import { audit } from "./audit";
import { lockMerchant } from "./ledger/locks";
export async function pauseMerchant(slug: string, paused: boolean) {
  return getDb().transaction(async (tx) => { const [merchant] = await tx.select().from(merchants).where(eq(merchants.slug,slug)); if (!merchant) return undefined; await lockMerchant(tx,merchant.id); await tx.update(merchants).set({ rewardsPaused: paused }).where(eq(merchants.id,merchant.id)); await audit(tx,merchant.id,paused ? "merchant.paused" : "merchant.resumed",merchant.id,{},"operator"); return { slug, rewardsPaused: paused }; });
}
export async function pauseAll(paused: boolean) { await getDb().transaction(async (tx) => { await tx.insert(settings).values({ key: "rewards_paused",value: paused }).onConflictDoUpdate({ target: settings.key,set: { value: paused,updatedAt: new Date() } }); await audit(tx,null,paused ? "rewards.paused" : "rewards.resumed","global",{},"operator"); }); return { rewardsPaused: paused }; }
