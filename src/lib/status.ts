import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiCalls, rewards, soakRuns, webhookEvents } from "@/db/schema";
import { aiEnabled, budgetPausedUntil } from "./ai/client";
import { getEnv } from "./env";
import { lastBeat } from "./heartbeat";
import { poolCounts } from "./demo/buyers";
import { rewardsPaused } from "./rewards/executor";
import { recentThrottles } from "./paypal/throttle-log";
import { loadMerchant } from "./merchants";
import { customerBudget } from "./rewards/enqueue";
import { demoPathsOff } from "./demo/runs";

export type Health = "ok" | "warn" | "down" | "info";
export type StatusRow = { key: string; label: string; health: Health; value: string };
const MIN = 60000,
  HOUR = 60 * MIN;
function ago(at: Date | undefined | null, now: Date) {
  if (!at) return "never";
  const ms = +now - +at;
  if (ms < 2 * MIN) return "just now";
  if (ms < 2 * HOUR) return `${Math.round(ms / MIN)} min ago`;
  if (ms < 48 * HOUR) return `${Math.round(ms / HOUR)} h ago`;
  return `${Math.round(ms / (24 * HOUR))} days ago`;
}
const fresh = (at: Date | undefined | null, now: Date, limitMs: number): Health =>
  at && +now - +at < limitMs ? "ok" : "warn";
const dollars = (cents: number) => "$" + (cents / 100).toFixed(2);
async function timed<T>(work: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Everything the public status page shows. Nothing here identifies a person, payment or key. */
export async function serviceStatus(now = new Date()) {
  const env = getEnv(),
    rows: StatusRow[] = [];
  const commit = process.env.RENDER_GIT_COMMIT?.slice(0, 7);
  rows.push({ key: "version", label: "Version", health: "info", value: commit ? `Build ${commit}` : "Local build" });
  rows.push({
    key: "environment",
    label: "Environment",
    health: "info",
    value: env.KICKBACK_ENV === "sandbox" ? "PayPal sandbox (test money only)" : "Live",
  });
  try {
    await timed(getDb().execute(sql`select 1`), 2000);
    rows.push({ key: "database", label: "Database", health: "ok", value: "ok" });
  } catch {
    rows.push({ key: "database", label: "Database", health: "down", value: "unavailable" });
    return { overall: "down" as Health, rows, checkedAt: now.toISOString() };
  }
  const [webhook] = await getDb()
    .select({ at: sql<Date | null>`max(${webhookEvents.receivedAt})` })
    .from(webhookEvents);
  const webhookAt = webhook?.at ? new Date(webhook.at) : undefined;
  rows.push({
    key: "webhooks",
    label: "Last PayPal webhook",
    health: fresh(webhookAt, now, 24 * HOUR),
    value: ago(webhookAt, now),
  });
  const jobs = await lastBeat("jobs");
  rows.push({ key: "jobs", label: "Background jobs", health: fresh(jobs, now, 15 * MIN), value: ago(jobs, now) });
  const reconcile = await lastBeat("reconcile");
  rows.push({
    key: "reconcile",
    label: "Nightly reconcile",
    health: fresh(reconcile, now, 26 * HOUR),
    value: ago(reconcile, now),
  });
  const [sent] = await getDb()
    .select({ at: sql<Date | null>`max(${rewards.sentAt})` })
    .from(rewards)
    .where(isNotNull(rewards.sentAt));
  const sentAt = sent?.at ? new Date(sent.at) : undefined;
  rows.push({ key: "rewards_sent", label: "Last reward sent", health: fresh(sentAt, now, 48 * HOUR), value: ago(sentAt, now) });
  const paused = await rewardsPaused(),
    rosa = await loadMerchant("rosas");
  rows.push({
    key: "rewards",
    label: "Rewards",
    health: paused || rosa?.rewardsPaused ? "warn" : "ok",
    value: paused ? "paused everywhere" : rosa?.rewardsPaused ? "paused at the demo cafe" : "sending",
  });
  if (rosa) {
    const budget = await getDb().transaction((tx) => customerBudget(tx, rosa, "", now));
    const left = Math.max(
      0,
      Math.min(
        rosa.spec.monthlyBudgetCents - budget.monthlyUsedCents,
        rosa.spec.dailyBudgetCents - budget.dailyUsedCents,
      ),
    );
    rows.push({
      key: "demo_budget",
      label: "Demo cafe reward budget left",
      health: left > 2000 ? "ok" : "warn",
      value: `${dollars(left)} today`,
    });
  }
  if (env.KICKBACK_ENV === "sandbox") {
    const pool = await poolCounts(),
      off = await demoPathsOff();
    rows.push({
      key: "demo_buyers",
      label: "Demo customers ready",
      health: off ? "warn" : pool.payReady >= 2 && pool.watchReady >= 1 ? "ok" : "warn",
      value: off
        ? "demo payments paused"
        : `${pool.payReady} for paying, ${pool.watchReady} for watching (${pool.payReserved} in use)`,
    });
  }
  const budgetUntil = await budgetPausedUntil(now);
  const [turns] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(aiCalls)
    .where(and(eq(aiCalls.feature, "analyst"), gte(aiCalls.createdAt, new Date(now.toISOString().slice(0, 10) + "T00:00:00Z"))));
  rows.push({
    key: "analyst",
    label: "Analyst",
    health: !aiEnabled() || budgetUntil ? "warn" : turns.n >= env.AI_MAX_ANALYST_TURNS_GLOBAL_PER_DAY ? "warn" : "ok",
    value: !aiEnabled()
      ? "turned off"
      : budgetUntil
        ? "paused (budget)"
        : turns.n >= env.AI_MAX_ANALYST_TURNS_GLOBAL_PER_DAY
          ? "daily limit reached"
          : "available",
  });
  const licensed = Boolean(process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY);
  rows.push({
    key: "cockpit",
    label: "Cockpit",
    health: licensed ? "ok" : "info",
    value: licensed ? "licensed" : "running on a trial licence (watermark shown)",
  });
  const throttles = await recentThrottles(now);
  rows.push({
    key: "paypal",
    label: "PayPal sandbox",
    health: throttles ? "warn" : "ok",
    value: throttles ? `throttled ${throttles} times in the last hour` : "no throttling in the last hour",
  });
  const [soak] = await getDb()
    .select({ ok: soakRuns.ok, finishedAt: soakRuns.finishedAt, startedAt: soakRuns.startedAt })
    .from(soakRuns)
    .orderBy(desc(soakRuns.startedAt))
    .limit(1);
  if (soak)
    rows.push({
      key: "soak",
      label: "Daily end-to-end check",
      health: soak.ok && +now - +soak.startedAt < 30 * HOUR ? "ok" : "warn",
      value: `${soak.ok ? "passed" : soak.finishedAt ? "failed" : "running"} ${ago(soak.startedAt, now)}`,
    });
  const overall: Health = rows.some((r) => r.health === "down")
    ? "down"
    : rows.some((r) => r.health === "warn")
      ? "warn"
      : "ok";
  return { overall, rows, checkedAt: now.toISOString() };
}
export type ServiceStatus = Awaited<ReturnType<typeof serviceStatus>>;
let cached: { at: number; value: ServiceStatus } | undefined;
/** The status report, recomputed at most every 30 seconds per process. */
export async function cachedStatus() {
  if (cached && Date.now() - cached.at < 30000) return cached.value;
  const value = await serviceStatus();
  cached = { at: Date.now(), value };
  return value;
}
