import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, type Tx } from "@/db";
import {
  backfillRuns,
  customers,
  demoBuyers,
  rewards,
  visits,
} from "@/db/schema";
import { getEnv } from "../env";
import { evaluate, localDay, type Progress, type VisitView } from "../engine/evaluate";
import { loadMerchant, type Merchant } from "../merchants";
import { customerBudget } from "../rewards/enqueue";
import { guardFeatures } from "../guard/features";
import { scoreGuard } from "../guard/score";
import { replayOnce } from "../payments/replay";
import {
  DEMO_TICKET_CENTS,
  buyerVault,
  releaseExpired,
  type DemoBuyer,
} from "./buyers";
import { dropLease, takeLease } from "../lease";

const HOUR = 3600000,
  DAY = 24 * HOUR;
/** Plausible counter times (minutes after local midnight) for staged visits. */
const SLOTS = [8 * 60 + 40, 11 * 60 + 55, 15 * 60 + 10, 18 * 60 + 25];
/** Staged visits stay this far from each other and from real ones: well past the merge window. */
const GAP_MS = 3 * HOUR;
const LOOKBACK_DAYS = 14;

function offsetMs(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return (
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) -
    Math.floor(date.getTime() / 1000) * 1000
  );
}
/** The instant that reads `minutes` past midnight on local `day` in `tz`. */
export function localTime(day: string, minutes: number, tz: string) {
  const [y, m, d] = day.split("-").map(Number),
    wall = Date.UTC(y, m - 1, d, 0, minutes);
  let t = wall;
  for (let i = 0; i < 2; i++) t = wall - offsetMs(new Date(t), tz);
  return new Date(t);
}
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/**
 * Visit times for staging: after `after` (the buyer's last visit), before
 * today in the shop's time zone, at least three hours apart, one per day
 * where there is room. `firstBy` makes a new buyer's first visit old enough
 * that Guard does not see a brand-new customer.
 */
export function stagingTimes({
  after,
  now,
  tz,
  count,
  firstBy,
}: {
  after?: Date;
  now: Date;
  tz: string;
  count: number;
  firstBy?: Date;
}) {
  if (count <= 0) return [];
  const today = localDay(now, tz),
    startOfToday = localTime(today, 0, tz),
    floor = after ? +after + GAP_MS : -Infinity;
  const days: string[] = [];
  for (let i = 1; i <= LOOKBACK_DAYS; i++) days.push(addDays(today, -i));
  const slots = days
    .flatMap((day, i) =>
      SLOTS.map((minutes, s) => ({
        day,
        // A small, stable offset so staged visits don't all share one minute.
        at: localTime(day, minutes + ((i * 7 + s * 13) % 17), tz),
      })),
    )
    .filter(({ at }) => +at > floor && at < startOfToday);
  const chosen: Date[] = [];
  const fits = (at: Date) => chosen.every((c) => Math.abs(+c - +at) >= GAP_MS);
  if (firstBy) {
    const first = slots.find(({ at }) => at <= firstBy);
    if (!first) return undefined;
    chosen.push(first.at);
  }
  // Latest days first keeps the cycle young inside the program window.
  for (const day of days) {
    if (chosen.length >= count) break;
    if (chosen.some((c) => localDay(c, tz) === day)) continue;
    const pick = slots.find((s) => s.day === day && fits(s.at));
    if (pick) chosen.push(pick.at);
  }
  for (const s of slots) {
    if (chosen.length >= count) break;
    if (fits(s.at)) chosen.push(s.at);
  }
  return chosen.length >= count
    ? chosen.slice(0, count).toSorted((a, b) => +a - +b)
    : undefined;
}

/** What Guard would score the buyer's next payment at `now`. */
export async function projectedGuard(
  tx: Tx,
  merchant: Merchant,
  key: string,
  now: Date,
) {
  const f = await guardFeatures(
    tx,
    merchant,
    key,
    "00000000-0000-0000-0000-000000000000",
    now,
  );
  return scoreGuard({
    ...f,
    mergedCaptures: 1,
    visitsToday: f.visitsToday + 1,
    completedVisits: f.completedVisits + 1,
    ticketCents: DEMO_TICKET_CENTS,
  });
}

type Plan =
  | { kind: "ready" }
  | { kind: "stage"; times: Date[] }
  | { kind: "wait"; note: string };
/** Decides the next step for one buyer from its real history, without side effects. */
export async function planBuyer(
  tx: Tx,
  merchant: Merchant,
  key: string | null,
  now: Date,
): Promise<Plan> {
  if (merchant.spec.type !== "VISIT_MILESTONE")
    return { kind: "wait", note: "Staging supports visit programs only" };
  const target = merchant.spec.n;
  const history: VisitView[] = key
    ? (
        await tx
          .select()
          .from(visits)
          .where(and(eq(visits.merchantId, merchant.id), eq(visits.customerKey, key)))
      ).map((v) => ({ ...v, source: v.source }))
    : [];
  const previous = key
    ? await tx
        .select()
        .from(rewards)
        .where(and(eq(rewards.merchantId, merchant.id), eq(rewards.customerKey, key)))
    : [];
  if (previous.some((r) => ["SCHEDULED", "SENDING", "HELD", "DEFERRED"].includes(r.state)))
    return { kind: "wait", note: "A reward is still in flight" };
  const budget = key
    ? await customerBudget(tx, merchant, key, now)
    : { dailyUsedCents: 0, monthlyUsedCents: 0, customerMonthlyUsedCents: 0 };
  const [importing] = await tx
    .select({ to: backfillRuns.windowTo })
    .from(backfillRuns)
    .where(and(eq(backfillRuns.merchantId, merchant.id), eq(backfillRuns.kind, "BACKFILL")))
    .orderBy(desc(backfillRuns.windowTo))
    .limit(1);
  const rewardableFrom = new Date(
    Math.max(merchant.program.effectiveFrom.getTime(), importing?.to.getTime() ?? 0),
  );
  const run = (extra: VisitView[]) =>
    evaluate(merchant.spec, [...history, ...extra], previous, budget, new Date(+now + 1000), merchant.tz, {
      rewardableFrom,
    });
  const current = run([]).progress.current;
  const last = history
    .filter((v) => v.status !== "VOID")
    .reduce<Date | undefined>((m, v) => (!m || v.startedAt > m ? v.startedAt : m), undefined);
  const needed = target - 1 - current;
  if (needed < 0) return { kind: "wait", note: "Progress is past the staging point" };
  const times =
    needed === 0
      ? []
      : stagingTimes({
          after: last,
          now,
          tz: merchant.tz,
          count: needed,
          firstBy: key ? undefined : new Date(+now - 8 * DAY),
        });
  if (!times)
    return { kind: "wait", note: "Waiting for room after the last visit" };
  // Staged visits must not earn anything; only the visitor's payment may.
  const staged: VisitView[] = times.map((t, i) => ({
    id: `staged-${i}`,
    startedAt: t,
    amountCents: DEMO_TICKET_CENTS,
    status: "COMPLETED",
    source: "REPLAY",
  }));
  const next: VisitView = {
    id: "next",
    startedAt: now,
    amountCents: DEMO_TICKET_CENTS,
    status: "COMPLETED",
    source: "REPLAY",
  };
  const projected = run([...staged, next]);
  const early = [...projected.intents, ...projected.consumed].filter((i) => i.visitId !== "next");
  if (early.length) return { kind: "wait", note: "Staging would earn a reward early" };
  if (!projected.intents.some((i) => i.visitId === "next"))
    return {
      kind: "wait",
      note: projected.consumed.some((i) => i.visitId === "next")
        ? "Monthly reward cap reached for this buyer"
        : "The next payment would not earn a reward",
    };
  return needed === 0 ? { kind: "ready" } : { kind: "stage", times };
}

async function setBuyer(slot: number, patch: Partial<DemoBuyer>) {
  await getDb()
    .update(demoBuyers)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(demoBuyers.slot, slot));
}

/** Readies the next buyer when Guard would pay its fifth visit instantly. */
async function markIfReady(buyer: DemoBuyer, merchant: Merchant, now: Date) {
  if (!buyer.customerKey) return false;
  const guard = await getDb().transaction((tx) =>
    projectedGuard(tx, merchant, buyer.customerKey!, now),
  );
  if (guard.tier !== "INSTANT") {
    await setBuyer(buyer.slot, {
      status: "cooling",
      notes: `Guard would score ${guard.score}: ${guard.reasons.join(" ")}`,
    });
    return false;
  }
  await setBuyer(buyer.slot, { status: "ready", notes: null });
  return true;
}

/**
 * One cron pass: release expired reservations, re-check ready buyers, and
 * bring at most one cooling buyer back to one visit before its reward.
 */
export async function stageDemoBuyers(now = new Date(), deadline = Date.now() + 30000) {
  const env = getEnv();
  if (env.KICKBACK_ENV !== "sandbox" || !env.DEMO_MODE) return { skipped: "demo mode off" };
  const released = await releaseExpired(now);
  // A ready buyer that someone paid with outside a reservation is no longer at the staging point.
  const ready = await getDb()
    .select()
    .from(demoBuyers)
    .where(and(eq(demoBuyers.status, "ready"), isNotNull(demoBuyers.customerKey)));
  let demoted = 0;
  for (const buyer of ready) {
    const merchant = await loadMerchant(buyer.merchantSlug, true);
    if (!merchant) continue;
    const [person] = await getDb()
      .select({ progress: customers.progress })
      .from(customers)
      .where(and(eq(customers.merchantId, merchant.id), eq(customers.key, buyer.customerKey!)));
    const progress = person?.progress as Progress | undefined;
    if (!progress || progress.current !== progress.target - 1) {
      await setBuyer(buyer.slot, { status: "cooling" });
      demoted++;
    }
  }
  if (Date.now() > deadline - 20000) return { released, demoted, staged: 0 };
  if (!(await takeLease("demo-staging", 90000, now)))
    return { released, demoted, staged: 0, busy: true };
  try {
    const [buyer] = await getDb()
      .select()
      .from(demoBuyers)
      .where(
        and(inArray(demoBuyers.status, ["cooling", "staging"]), isNotNull(demoBuyers.vaultEnc)),
      )
      .orderBy(sql`${demoBuyers.lastStagedAt} asc nulls first`, asc(demoBuyers.slot))
      .limit(1);
    if (!buyer) return { released, demoted, staged: 0 };
    await setBuyer(buyer.slot, { lastStagedAt: now });
    const merchant = await loadMerchant(buyer.merchantSlug);
    if (!merchant) {
      await setBuyer(buyer.slot, { notes: "Demo business is not taking payments" });
      return { released, demoted, staged: 0 };
    }
    const plan = await getDb().transaction((tx) =>
      planBuyer(tx, merchant, buyer.customerKey, now),
    );
    if (plan.kind === "wait") {
      await setBuyer(buyer.slot, { status: "cooling", notes: plan.note });
      return { released, demoted, staged: 0, slot: buyer.slot, note: plan.note };
    }
    let key = buyer.customerKey,
      staged = 0;
    if (plan.kind === "stage") {
      const vaultId = await buyerVault(buyer);
      if (!vaultId) return { released, demoted, staged: 0 };
      await setBuyer(buyer.slot, { status: "staging" });
      for (const at of plan.times) {
        if (Date.now() > deadline - 8000) break;
        const { result } = await replayOnce({
          slug: merchant.slug,
          amountCents: DEMO_TICKET_CENTS,
          vaultId,
          demoVisitAt: at,
          deadline,
          settle: false,
        });
        if (!result.recognized) {
          await setBuyer(buyer.slot, { status: "disabled", notes: "Saved wallet payments are not recognized" });
          return { released, demoted, staged, slot: buyer.slot };
        }
        if (key && key !== result.customerKey) {
          await setBuyer(buyer.slot, { status: "disabled", notes: "Saved wallet belongs to a different buyer" });
          return { released, demoted, staged, slot: buyer.slot };
        }
        key = result.customerKey;
        staged++;
        if (result.rewardIds.length || result.reward) {
          await setBuyer(buyer.slot, { status: "disabled", customerKey: key, notes: "Staging earned a reward; check the program" });
          return { released, demoted, staged, slot: buyer.slot };
        }
      }
      await setBuyer(buyer.slot, { status: "cooling", customerKey: key });
      if (staged < plan.times.length) return { released, demoted, staged, slot: buyer.slot };
    }
    const fresh = { ...buyer, customerKey: key };
    const isReady = await markIfReady(fresh, merchant, new Date());
    return { released, demoted, staged, slot: buyer.slot, ready: isReady };
  } finally {
    await dropLease("demo-staging");
  }
}
