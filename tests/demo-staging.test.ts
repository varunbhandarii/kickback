import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { demoBuyers, rewards, visits } from "@/db/schema";
import { localDay } from "@/lib/engine/evaluate";
import { fixture, purchase, resetDb, setupDb, teardownDb } from "./helpers/db";
const state = vi.hoisted(() => ({ merchant: undefined as unknown, account: "DEMO_BUYER_ONE" }));
vi.mock("@/lib/payments/replay", () => ({
  // The sandbox purchase itself, recorded at the requested time with a fixed buyer.
  replayOnce: async ({ demoVisitAt, amountCents }: { demoVisitAt?: Date; amountCents: number }) => {
    const { order, result } = await purchase(state.merchant as Awaited<ReturnType<typeof fixture>>, {
      at: demoVisitAt ?? new Date(),
      amount: amountCents,
      account: state.account,
    });
    return { orderId: order.id, result };
  },
}));
vi.mock("@/lib/rewards/executor", async (original) => ({
  ...(await original<typeof import("@/lib/rewards/executor")>()),
  settleReward: async (id: string) => {
    await getDb()
      .update(rewards)
      .set({ state: "SENT", refundId: "REFUND123", sentAt: new Date() })
      .where(eq(rewards.id, id));
    return { claimed: true, sent: true, refundId: "REFUND123" };
  },
}));
import { addDays, localTime, stagingTimes, stageDemoBuyers } from "@/lib/demo/staging";
import { reserveBuyer, upsertBuyer, releaseExpired } from "@/lib/demo/buyers";
import { executeDemoRun, runView, startDemoRun } from "@/lib/demo/runs";

const HOUR = 3600000;
describe("staging times", () => {
  const tz = "America/New_York",
    now = new Date("2026-11-20T17:00:00Z");
  it("picks distinct earlier days, never today, at least three hours apart", () => {
    const times = stagingTimes({ after: new Date("2026-11-10T15:00:00Z"), now, tz, count: 4 })!;
    expect(times).toHaveLength(4);
    const days = times.map((t) => localDay(t, tz));
    expect(new Set(days).size).toBe(4);
    expect(days).not.toContain(localDay(now, tz));
    for (let i = 1; i < times.length; i++) expect(+times[i] - +times[i - 1]).toBeGreaterThanOrEqual(3 * HOUR);
    expect(times.every((t) => t < localTime(localDay(now, tz), 0, tz))).toBe(true);
  });
  it("stays after the buyer's last visit and packs a short gap into one day", () => {
    const last = localTime(addDays(localDay(now, tz), -1), 7 * 60, tz);
    const times = stagingTimes({ after: last, now, tz, count: 3 })!;
    expect(times).toHaveLength(3);
    expect(times.every((t) => +t >= +last + 3 * HOUR)).toBe(true);
    expect(stagingTimes({ after: last, now, tz, count: 4 })).toBeUndefined();
  });
  it("waits when there is no room before today", () => {
    expect(stagingTimes({ after: new Date(+now - HOUR), now, tz, count: 1 })).toBeUndefined();
  });
  it("starts a new buyer's history more than a week ago", () => {
    const firstBy = new Date(+now - 8 * 24 * HOUR);
    const times = stagingTimes({ now, tz, count: 4, firstBy })!;
    expect(times[0] <= firstBy).toBe(true);
  });
  it("converts local wall time across a DST change", () => {
    expect(localTime("2026-11-01", 12 * 60, tz).toISOString()).toBe("2026-11-01T17:00:00.000Z");
    expect(localTime("2026-10-31", 12 * 60, tz).toISOString()).toBe("2026-10-31T16:00:00.000Z");
  });
});

describe("demo buyer staging and live runs", () => {
  beforeAll(setupDb);
  afterAll(teardownDb);
  beforeEach(async () => {
    await resetDb();
    await getDb().delete(demoBuyers);
    state.merchant = await fixture();
  });
  const key = async () => (await getDb().select().from(demoBuyers).where(eq(demoBuyers.slot, 0)))[0];
  it("stages four earlier visits, then a live run earns exactly one instant reward", async () => {
    await upsertBuyer({ slot: 0, email: "kb-demo-0@example.com", purpose: "watch", published: false }, "VAULT-0");
    const now = new Date();
    const staged = await stageDemoBuyers(now, Date.now() + 60000);
    expect(staged).toMatchObject({ staged: 4, ready: true });
    const buyer = await key();
    expect(buyer.status).toBe("ready");
    const tz = (state.merchant as { tz: string }).tz;
    const history = await getDb().select().from(visits).where(eq(visits.customerKey, buyer.customerKey!));
    expect(history).toHaveLength(4);
    expect(history.map((v) => localDay(v.startedAt, tz))).not.toContain(localDay(now, tz));
    expect(await getDb().select().from(rewards)).toHaveLength(0);

    const started = await startDemoRun("visitor-hash");
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect((await key()).status).toBe("reserved");
    await executeDemoRun(started.id);
    const run = await runView(started.id);
    expect(run).toMatchObject({ state: "refund_sent", refundId: "REFUND123", progress: { current: 5, target: 5 } });
    expect(run!.note).toContain("Rosa");
    expect(JSON.stringify(run)).not.toContain(buyer.customerKey!);
    const [reward] = await getDb().select().from(rewards);
    expect(reward).toMatchObject({ tier: "INSTANT", state: "SENT" });
    expect(reward.guardScore).toBeLessThan(30);
    expect(await key()).toMatchObject({ status: "cooling" });
    expect((await key()).lastRewardAt).not.toBeNull();

    // The same visitor can't start another run straight away, and nothing is ready yet.
    expect(await startDemoRun("visitor-hash")).toMatchObject({ ok: false, lastRunId: started.id });
    expect(await startDemoRun("someone-else")).toMatchObject({ ok: false });
    // Staging waits for room after the reward visit instead of backdating around it.
    expect(await stageDemoBuyers(new Date(), Date.now() + 60000)).toMatchObject({ staged: 0 });
    expect((await key()).notes).toMatch(/room after the last visit/);
  });
  it("demotes a ready buyer someone paid with outside a reservation", async () => {
    await upsertBuyer({ slot: 0, email: "kb-demo-0@example.com", purpose: "pay" }, "VAULT-0");
    await stageDemoBuyers(new Date(), Date.now() + 60000);
    expect((await key()).status).toBe("ready");
    await purchase(state.merchant as Awaited<ReturnType<typeof fixture>>, { account: state.account });
    await stageDemoBuyers(new Date(), Date.now() + 60000);
    expect((await key()).status).toBe("cooling");
  });
  it("refuses to stage a buyer whose monthly cap is used up", async () => {
    await upsertBuyer({ slot: 0, email: "kb-demo-0@example.com", purpose: "pay" }, "VAULT-0");
    await getDb().update(demoBuyers).set({ status: "cooling" });
    const merchant = state.merchant as Awaited<ReturnType<typeof fixture>>;
    // Five rewards already sent this month fill the $10 per-customer cap.
    for (let i = 0; i < 5; i++) {
      const { result } = await purchase(merchant, { account: state.account, at: new Date(Date.now() - (14 - i) * 24 * HOUR) });
      if (!result.recognized) throw new Error("unrecognized");
      await getDb().update(demoBuyers).set({ customerKey: result.customerKey });
      await getDb().insert(rewards).values({
        merchantId: merchant.id,
        customerKey: result.customerKey,
        programId: merchant.program.id,
        visitId: result.visit.id,
        amountCents: 200,
        basisVisitIds: [],
        state: "CONFIRMED",
        tier: "INSTANT",
        requestId: crypto.randomUUID(),
        note: "Thanks",
        reason: "VISIT_MILESTONE",
        createdAt: new Date(Date.now() - i * 60000),
        guardScore: 0,
      });
    }
    const pass = await stageDemoBuyers(new Date(), Date.now() + 60000);
    expect(pass).toMatchObject({ staged: 0 });
    expect((await key()).notes).toMatch(/cap/);
    expect((await key()).status).toBe("cooling");
  });
  it("reserves one buyer per holder and returns expired holds to the pool", async () => {
    await upsertBuyer({ slot: 1, email: "kb-demo-1@example.com", purpose: "pay" }, "VAULT-1");
    await getDb().update(demoBuyers).set({ status: "ready" });
    const a = await reserveBuyer("pay", "pay:a");
    expect(a?.slot).toBe(1);
    expect((await reserveBuyer("pay", "pay:a"))?.slot).toBe(1);
    expect(await reserveBuyer("pay", "pay:b")).toBeUndefined();
    expect(await reserveBuyer("watch", "run:x")).toBeUndefined();
    expect(await releaseExpired(new Date(Date.now() + 31 * 60000))).toBe(1);
    // Without a published login, a pay buyer is never handed out (or held).
    await getDb().update(demoBuyers).set({ status: "ready" });
    expect(await reserveBuyer("pay", "pay:c", new Date(), [])).toBeUndefined();
    expect(await reserveBuyer("pay", "pay:c", new Date(), ["someone-else@example.com"])).toBeUndefined();
    expect((await reserveBuyer("pay", "pay:c", new Date(), ["kb-demo-1@example.com"]))?.slot).toBe(1);
    await releaseExpired(new Date(Date.now() + 31 * 60000));
    const [row] = await getDb().select().from(demoBuyers).where(and(eq(demoBuyers.slot, 1)));
    expect(row).toMatchObject({ status: "cooling", reservedBy: null });
  });
});
