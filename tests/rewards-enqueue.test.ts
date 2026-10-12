import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { customers, offsets, rewards } from "@/db/schema";
import { enqueue } from "@/lib/rewards/enqueue";
import { applyRewardRefund, foreignRefund } from "@/lib/ledger/clawback";
import { defaultProgram } from "@/lib/engine/program";
import { setupDb, teardownDb, resetDb, fixture, purchase, milestone } from "./helpers/db";
beforeAll(setupDb,30000); afterAll(teardownDb); beforeEach(resetDb);
describe("reward enqueue",() => {
  it("enqueues once and enforces the SQL visit uniqueness constraint",async () => { const merchant = await fixture(), { reward } = await milestone(merchant); await getDb().transaction((tx) => enqueue(tx,merchant,reward.customerKey)); expect(await getDb().select().from(rewards)).toHaveLength(1); const { id: _id,refundId: _refund,...copy } = reward; void _id; void _refund; await expect(getDb().insert(rewards).values({ ...copy,id: randomUUID(),requestId: randomUUID() })).rejects.toThrow(); });
  it("serializes daily budgets across different customers",async () => { const merchant = await fixture({ ...defaultProgram,dailyBudgetCents: 200 }); await milestone(merchant,"a"); const { reward } = await milestone(merchant,"b"); expect(reward).toMatchObject({ state: "CANCELLED",reason: "DAILY_BUDGET" }); await getDb().transaction((tx) => enqueue(tx,merchant,reward.customerKey)); expect(await getDb().select().from(rewards)).toHaveLength(2); });
  it.each(["DELAYED","REVIEW"] as const)("respects %s settlement",async (settlement) => { const { reward } = await milestone(await fixture({ ...defaultProgram,settlement })); if (settlement === "REVIEW") expect(reward.state).toBe("HELD"); else expect(reward.settleAt.getTime()).toBeGreaterThan(Date.now()+23*3600000); });
  it("applies a clawback debit once without violating positive gross amount",async () => { const merchant = await fixture(), { reward } = await milestone(merchant); await applyRewardRefund(reward.id,{ id: "REFUND1",status: "COMPLETED",amountCents: 200 }); await foreignRefund(merchant,reward.captureId!,"OUTSIDE1",350); await foreignRefund(merchant,reward.captureId!,"OUTSIDE1",350); expect(await getDb().select().from(offsets)).toMatchObject([{ kind: "DEBIT",remainingCents: 200 }]); let latest; for (let n = 0; n < 5; n++) latest = await purchase(merchant,{ at: new Date(Date.now()-(.9-n*.16)*86400000) }); expect(latest?.result.recognized && latest.result.reward).toMatchObject({ state: "OFFSET",amountCents: 200,offsetAppliedCents: 200 }); expect(await getDb().select().from(offsets)).toMatchObject([{ remainingCents: 0 }]); });
  it("cancels an unpaid reward after a foreign return",async () => { const merchant = await fixture(), { reward } = await milestone(merchant); await foreignRefund(merchant,reward.captureId!,"OUTSIDE2",550); expect(await getDb().select().from(rewards)).toMatchObject([{ state: "CANCELLED",reason: "CLAWBACK" }]); expect(await getDb().select().from(offsets)).toHaveLength(0); });
  it("holds newly earned rewards for a frozen customer",async () => { const merchant = await fixture(), first = await purchase(merchant,{ at: new Date(Date.now()-6*86400000) }); if (!first.result.recognized) throw new Error("Identity required"); await getDb().update(customers).set({ status: "FROZEN" }).where(eq(customers.key,first.result.customerKey)); const { reward } = await milestone(merchant); expect(reward.state).toBe("HELD"); });
});
