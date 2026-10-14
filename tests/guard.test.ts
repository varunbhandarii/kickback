import { randomUUID } from "node:crypto";
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  customers,
  guardFlags,
  merchantUsers,
  orders,
  rewards,
  user,
} from "@/db/schema";
import { scoreGuard, type GuardFeatures } from "@/lib/guard/score";
import { decideReview } from "@/lib/guard/review";
import { settleReward } from "@/lib/rewards/executor";
import { defaultProgram } from "@/lib/engine/program";
import {
  fixture,
  milestone,
  purchase,
  resetDb,
  setupDb,
  teardownDb,
} from "./helpers/db";
const normal: GuardFeatures = {
  mergedCaptures: 1,
  visitsToday: 1,
  customerAgeDays: 60,
  completedVisits: 5,
  ticketCents: 550,
  medianTicketCents: 550,
  priorClawback: false,
  priorDeclinedOrHeld: false,
  rewardsLast7Days: 0,
  minTicketCents: 300,
  dayBudgetBurnCents: 0,
  simulatedDailyMeanCents: 0,
};
describe("deterministic Guard", () => {
  it("keeps ordinary regulars instant and applies the settlement floor", () => {
    expect(scoreGuard(normal)).toMatchObject({ score: 0, tier: "INSTANT" });
    expect(scoreGuard(normal, "DELAYED").tier).toBe("DELAYED");
    expect(scoreGuard(normal, "REVIEW").tier).toBe("REVIEW");
  });
  it("routes splits plus new-account farming to review, bursts to delay", () => {
    expect(
      scoreGuard({ ...normal, mergedCaptures: 3, customerAgeDays: 1 }),
    ).toMatchObject({ score: 60, tier: "REVIEW" });
    expect(
      scoreGuard({ ...normal, visitsToday: 3, customerAgeDays: 1 }),
    ).toMatchObject({ score: 45, tier: "DELAYED" });
  });
  it("caps score and uses the stronger ticket anomaly once", () => {
    expect(
      scoreGuard({
        ...normal,
        ticketCents: 6000,
        priorClawback: true,
        priorDeclinedOrHeld: true,
        rewardsLast7Days: 2,
        mergedCaptures: 3,
      }).score,
    ).toBe(100);
    expect(scoreGuard({ ...normal, ticketCents: 6000 }).score).toBe(30);
  });
});
describe("Guard enqueue and merchant review", () => {
  beforeAll(setupDb);
  beforeEach(resetDb);
  afterAll(teardownDb);
  afterEach(() => vi.useRealTimers());
  async function owner(merchantId: string) {
    const id = randomUUID();
    await getDb()
      .insert(user)
      .values({ id, email: id + "@example.com", name: "Owner" });
    await getDb()
      .insert(merchantUsers)
      .values({ merchantId, userId: id, role: "OWNER" });
    return id;
  }
  it("holds an actual split visit, approves once, and uses the normal refund executor", async () => {
    const merchant = await fixture({
        ...defaultProgram,
        n: 3,
        minTicketCents: 1000,
      }),
      now = new Date();
    await purchase(merchant, {
      at: new Date(+now - 2 * 86400000),
      amount: 1200,
    });
    await purchase(merchant, { at: new Date(+now - 86400000), amount: 1200 });
    for (let i = 0; i < 3; i++)
      await purchase(merchant, {
        at: new Date(+now - 20 * 60000 + i * 10 * 60000),
        amount: 400,
      });
    const [reward] = await getDb().select().from(rewards);
    expect(reward).toMatchObject({
      state: "HELD",
      tier: "REVIEW",
      guardScore: 60,
      reason: "REVIEW",
    });
    const actor = await owner(merchant.id);
    expect(
      (await decideReview(merchant.id, reward.id, "APPROVED", actor)).changed,
    ).toBe(true);
    expect(
      (await decideReview(merchant.id, reward.id, "APPROVED", actor)).changed,
    ).toBe(false);
    const request = vi.fn(async () => ({
      id: "REFUND",
      status: "COMPLETED",
      amount: { currency_code: "USD", value: "2.00" },
    }));
    expect((await settleReward(reward.id, { request })).sent).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect((await getDb().select().from(guardFlags))[0].decision).toBe(
      "APPROVED",
    );
  });
  it("delays burst rewards by 24 hours and does not claim them early", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T22:00:00Z"));
    const merchant = await fixture({ ...defaultProgram, n: 3 }),
      now = new Date();
    for (let i = 0; i < 3; i++)
      await purchase(merchant, { at: new Date(+now - (2 - i) * 3 * 3600000) });
    const [reward] = await getDb().select().from(rewards);
    expect(reward.tier).toBe("DELAYED");
    expect(+reward.settleAt - Date.now()).toBeGreaterThan(23 * 3600000);
    expect((await settleReward(reward.id)).claimed).toBe(false);
  });
  it("declines without restoring the consumed cycle", async () => {
    const merchant = await fixture({ ...defaultProgram, settlement: "REVIEW" }),
      result = await milestone(merchant),
      actor = await owner(merchant.id);
    await decideReview(merchant.id, result.reward.id, "DECLINED", actor);
    await purchase(merchant);
    const rows = await getDb().select().from(rewards);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: "CANCELLED", reason: "DECLINED" });
  });
  it("rejects cross-tenant and frozen-customer approval", async () => {
    const merchant = await fixture({ ...defaultProgram, settlement: "REVIEW" }),
      result = await milestone(merchant),
      other = await fixture({ ...defaultProgram }, "other"),
      actor = await owner(other.id);
    await expect(
      decideReview(merchant.id, result.reward.id, "APPROVED", actor),
    ).rejects.toThrow("NOT_AUTHORIZED");
    const legitimate = await owner(merchant.id);
    await getDb()
      .update(customers)
      .set({ status: "FROZEN" })
      .where(eq(customers.merchantId, merchant.id));
    await expect(
      decideReview(merchant.id, result.reward.id, "APPROVED", legitimate),
    ).rejects.toThrow("ELIGIBLE");
  });
  it("excludes fixture orders from every normal refund attempt", async () => {
    const merchant = await fixture(),
      result = await milestone(merchant);
    await getDb()
      .update(orders)
      .set({ status: "FIXTURE" })
      .where(eq(orders.id, result.order.id));
    const request = vi.fn();
    await settleReward(result.reward.id, { request });
    expect(request).not.toHaveBeenCalled();
    const [row] = await getDb()
      .select()
      .from(rewards)
      .where(
        and(
          eq(rewards.merchantId, merchant.id),
          eq(rewards.id, result.reward.id),
        ),
      );
    expect(row.state).toBe("CANCELLED");
    expect(row.reason).toBe("FIXTURE_NOT_REFUNDABLE");
  });
});
