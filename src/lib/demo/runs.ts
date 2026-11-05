import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { demoBuyers, demoRuns, rewards, settings } from "@/db/schema";
import { getEnv } from "../env";
import { loadMerchant } from "../merchants";
import { replayOnce } from "../payments/replay";
import { rewardsPaused, settleReward } from "../rewards/executor";
import type { Progress } from "../engine/evaluate";
import { customerBudget } from "../rewards/enqueue";
import { DEMO_TICKET_CENTS, buyerVault, coolBuyer, readyCount, reserveBuyer } from "./buyers";

export const RUN_STATES = [
  "queued",
  "paying",
  "paid",
  "counted",
  "reward_scheduled",
  "refund_sent",
  "confirmed",
] as const;
export type RunState = (typeof RUN_STATES)[number] | "failed";
const RUN_GAP_MS = 3 * 60000;
/** A failure whose message is safe to show the visitor. */
class RunProblem extends Error {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Why a run can't start: switched off on purpose, out of capacity for now
 * (no customer ready, daily caps), or something is actually broken.
 */
export type ClosedReason = "off" | "capacity" | "broken";
type Closed = { message: string; reason: ClosedReason };
export type StartResult =
  | { ok: true; id: string }
  | { ok: false; error: string; reason: ClosedReason; lastRunId?: string };

/** The most recent run that ended with a confirmed or sent reward, to show when no buyer is free. */
export async function lastGoodRun() {
  const [row] = await getDb()
    .select({ id: demoRuns.id })
    .from(demoRuns)
    .where(and(eq(demoRuns.kind, "watch"), inArray(demoRuns.state, ["refund_sent", "confirmed"])))
    .orderBy(desc(demoRuns.createdAt))
    .limit(1);
  return row?.id;
}

const PATHS_OFF = "demo_paths_off";
/** Operator switch for the two paths that move sandbox money; read on every request. */
export async function demoPathsOff() {
  if (!getEnv().DEMO_PATHS_ENABLED) return true;
  const [row] = await getDb().select().from(settings).where(eq(settings.key, PATHS_OFF));
  return row?.value === true;
}
export async function setDemoPathsOff(off: boolean) {
  await getDb()
    .insert(settings)
    .values({ key: PATHS_OFF, value: off })
    .onConflictDoUpdate({ target: settings.key, set: { value: off, updatedAt: new Date() } });
  return { demoPathsOff: off };
}
/** Reward money left today at the demo cafe, within its daily and monthly budgets. */
export async function budgetLeftCents(slug: string) {
  const merchant = await loadMerchant(slug);
  if (!merchant) return 0;
  const used = await getDb().transaction((tx) => customerBudget(tx, merchant, "", new Date()));
  return Math.min(
    merchant.spec.dailyBudgetCents - used.dailyUsedCents,
    merchant.spec.monthlyBudgetCents - used.monthlyUsedCents,
  );
}
async function paymentsClosed(): Promise<Closed | undefined> {
  const env = getEnv();
  if (env.KICKBACK_ENV !== "sandbox" || !env.DEMO_MODE)
    return { reason: "off", message: "The live demo is turned off on this deployment." };
  if (await demoPathsOff())
    return { reason: "off", message: "Demo payments are paused for maintenance. Explore the merchant app meanwhile." };
  if (await rewardsPaused()) return { reason: "off", message: "Rewards are paused on this deployment right now." };
  const rosa = await loadMerchant("rosas");
  if (!rosa) return { reason: "broken", message: "The demo cafe isn't sending rewards right now." };
  if (rosa.rewardsPaused) return { reason: "off", message: "The demo cafe isn't sending rewards right now." };
  if ((await budgetLeftCents("rosas")) < rosa.spec.rewardCents)
    return {
      reason: "capacity",
      message: "The demo cafe has used today's reward budget. Come back tomorrow, or explore the merchant app.",
    };
  return undefined;
}
async function watchClosed(): Promise<Closed | undefined> {
  const closed = await paymentsClosed();
  if (closed) return closed;
  const [day] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(demoRuns)
    .where(and(eq(demoRuns.kind, "watch"), gte(demoRuns.createdAt, new Date(Date.now() - 86400000))));
  if (day.n >= getEnv().DEMO_RUNS_PER_DAY)
    return { reason: "capacity", message: "Today's live runs are used up. Here is the most recent one." };
  return undefined;
}
/** Why the paying paths are closed right now, or undefined. Shared by `/demo` and the actions. */
export async function demoPaymentsUnavailable() {
  return (await paymentsClosed())?.message;
}
/** Why a run cannot start right now, or undefined. */
export async function watchUnavailable() {
  return (await watchClosed())?.message;
}

/** Pay customers lend themselves to watch runs only while this many are ready. */
export const PAY_FALLBACK_MIN = 3;
export async function startDemoRun(
  ipKey: string,
  options: { keepOneForVisitors?: boolean } = {},
): Promise<StartResult> {
  const blocked = await watchClosed();
  if (blocked) return { ok: false, error: blocked.message, reason: blocked.reason, lastRunId: await lastGoodRun() };
  const [recent] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(demoRuns)
    .where(and(eq(demoRuns.ipHash, ipKey), gte(demoRuns.createdAt, new Date(Date.now() - RUN_GAP_MS))));
  if (recent.n > 0)
    return {
      ok: false,
      error: "You just ran the demo. Give it a few minutes, or watch your last run again.",
      reason: "capacity",
      lastRunId: await lastGoodRun(),
    };
  // The daily check never takes the last ready watch customer from visitors.
  if (options.keepOneForVisitors && (await readyCount("watch")) < 2)
    return {
      ok: false,
      error: "Leaving the last ready demo customer for visitors.",
      reason: "capacity",
      lastRunId: await lastGoodRun(),
    };
  const id = randomUUID();
  let buyer = await reserveBuyer("watch", "run:" + id);
  // Visitors' runs borrow a ready pay customer when every watch customer is resting.
  if (!buyer && !options.keepOneForVisitors && (await readyCount("pay")) >= PAY_FALLBACK_MIN)
    buyer = await reserveBuyer("pay", "run:" + id);
  if (!buyer)
    return {
      ok: false,
      error: "The demo customers are getting ready again. Try “Pay as a customer”, or watch the most recent run.",
      reason: "capacity",
      lastRunId: await lastGoodRun(),
    };
  const merchant = await loadMerchant(buyer.merchantSlug);
  if (!merchant || merchant.rewardsPaused) {
    await coolBuyer(buyer.slot, false);
    return {
      ok: false,
      error: "The demo cafe isn't taking payments right now.",
      reason: merchant ? "off" : "broken",
      lastRunId: await lastGoodRun(),
    };
  }
  await getDb().insert(demoRuns).values({ id, kind: "watch", ipHash: ipKey, buyerSlot: buyer.slot });
  return { ok: true, id };
}

async function step(id: string, state: RunState, patch: Partial<typeof demoRuns.$inferInsert> = {}) {
  await getDb()
    .update(demoRuns)
    .set({
      state,
      ...patch,
      ...(state === "failed" || state === "refund_sent" || state === "confirmed" ? { finishedAt: new Date() } : {}),
    })
    .where(eq(demoRuns.id, id));
}

/** Runs one real sandbox payment for the reserved buyer, then sends its reward. */
export async function executeDemoRun(id: string) {
  const [run] = await getDb().select().from(demoRuns).where(eq(demoRuns.id, id));
  if (!run || run.state !== "queued" || run.buyerSlot === null) return;
  const [buyer] = await getDb().select().from(demoBuyers).where(eq(demoBuyers.slot, run.buyerSlot));
  const deadline = Date.now() + 60000;
  let rewarded = false;
  try {
    const vaultId = buyer && (await buyerVault(buyer));
    if (!vaultId) throw new RunProblem("The demo customer's saved wallet is unavailable.");
    await step(id, "paying");
    const { orderId, result } = await replayOnce({
      slug: buyer.merchantSlug,
      amountCents: DEMO_TICKET_CENTS,
      vaultId,
      deadline,
      settle: false,
    });
    await step(id, "paid", { orderId, captureId: result.captureId });
    if (!result.recognized) throw new RunProblem("The payment went through but wasn't linked to a wallet.");
    const p = result.progress as Progress;
    await step(id, "counted", {
      progress: { current: result.reward ? p.target : p.current, target: p.target, rewardCents: p.rewardCents },
    });
    const reward = result.reward;
    if (!reward) throw new RunProblem("This payment counted as a visit but didn't complete the card.");
    if (reward.state !== "SCHEDULED")
      throw new RunProblem(
        reward.state === "HELD"
          ? "Guard held this reward for the owner's review, so no refund was sent."
          : "The reward was recorded but can't be sent right now.",
      );
    await step(id, "reward_scheduled", { rewardId: reward.id, note: reward.note });
    const sent = await settleReward(reward.id, { deadline });
    const [row] = await getDb().select().from(rewards).where(eq(rewards.id, reward.id));
    if (!sent.claimed || !row?.refundId)
      throw new RunProblem("The reward is waiting to be sent; the cron will retry it shortly.");
    rewarded = true;
    await step(id, "refund_sent", { refundId: row.refundId, note: row.note });
  } catch (e) {
    await step(id, "failed", {
      error: e instanceof RunProblem ? e.message : "The sandbox payment didn't complete. Try again in a few minutes.",
    });
    console.error(JSON.stringify({ action: "demo_run_failed", id, error: e instanceof Error ? e.name : "unknown" }));
  } finally {
    if (buyer) await coolBuyer(buyer.slot, rewarded);
  }
}

/** Public view of a run: no customer key, no wallet, nothing beyond sandbox ids and the stored note. */
export async function runView(id: string) {
  if (!UUID.test(id)) return undefined;
  const [run] = await getDb().select().from(demoRuns).where(eq(demoRuns.id, id));
  if (!run || run.kind !== "watch") return undefined;
  const [reward] = run.rewardId
    ? await getDb()
        .select({ state: rewards.state, amountCents: rewards.amountCents, sentAt: rewards.sentAt, confirmedAt: rewards.confirmedAt })
        .from(rewards)
        .where(eq(rewards.id, run.rewardId))
    : [];
  let state = run.state as RunState;
  if (state === "refund_sent" && reward?.state === "CONFIRMED") {
    state = "confirmed";
    await step(id, "confirmed");
  }
  return {
    id: run.id,
    state,
    orderId: run.orderId,
    captureId: run.captureId,
    refundId: run.refundId,
    note: run.note,
    progress: run.progress as { current: number; target: number; rewardCents: number } | null,
    amountCents: reward?.amountCents ?? null,
    error: run.error,
    createdAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    confirmedAt: reward?.confirmedAt?.toISOString() ?? null,
  };
}
export type RunView = NonNullable<Awaited<ReturnType<typeof runView>>>;
