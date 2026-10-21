import { eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { soakRuns } from "@/db/schema";
import { getEnv } from "../env";
import { aiEnabled, budgetPausedUntil, structured } from "../ai/client";
import { beat } from "../heartbeat";
import { loadMerchant } from "../merchants";
import { programMetrics } from "../guard/notices";
import { serviceStatus } from "../status";
import { executeDemoRun, runView, startDemoRun } from "./runs";

type Step = { name: string; ok: boolean; ms: number; detail?: string };
const SOAK_HOUR_UTC = 15;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Once a day, from 15:00 UTC, if today's check has not run yet. */
export async function soakDue(now = new Date()) {
  const env = getEnv();
  if (env.KICKBACK_ENV !== "sandbox" || !env.DEMO_MODE || now.getUTCHours() < SOAK_HOUR_UTC) return false;
  const [today] = await getDb()
    .select({ id: soakRuns.id })
    .from(soakRuns)
    .where(gte(soakRuns.startedAt, new Date(now.toISOString().slice(0, 10) + "T00:00:00Z")))
    .limit(1);
  return !today;
}

/**
 * The daily end-to-end check: status, one real watch run to a confirmed
 * refund, the demo cafe's metrics, one cheap Analyst call and the public demo page.
 */
export async function runSoak() {
  const env = getEnv();
  const [row] = await getDb().insert(soakRuns).values({}).returning();
  const steps: Step[] = [];
  const check = async (name: string, work: () => Promise<string | undefined>) => {
    const started = Date.now();
    try {
      const detail = await work();
      steps.push({ name, ok: true, ms: Date.now() - started, ...(detail ? { detail } : {}) });
    } catch (e) {
      steps.push({ name, ok: false, ms: Date.now() - started, detail: e instanceof Error ? e.message.slice(0, 200) : "failed" });
    }
  };
  await check("status", async () => {
    const status = await serviceStatus();
    if (status.overall === "down") throw new Error("A component is down");
    return status.overall;
  });
  await check("watch-run", async () => {
    const started = await startDemoRun("soak");
    if (!started.ok) throw new Error(started.error);
    await executeDemoRun(started.id);
    const until = Date.now() + 120000;
    for (;;) {
      const run = await runView(started.id);
      if (run?.state === "confirmed") return "confirmed";
      if (run?.state === "failed") throw new Error(run.error ?? "Run failed");
      if (Date.now() > until) throw new Error(`Not confirmed after 120 s (${run?.state ?? "missing"})`);
      await sleep(5000);
    }
  });
  await check("metrics", async () => {
    const rosa = await loadMerchant("rosas");
    if (!rosa) throw new Error("Demo cafe unavailable");
    const metrics = (await programMetrics(rosa.id, 30)) as Record<string, unknown>;
    if (!metrics || !Object.keys(metrics).length) throw new Error("No metrics returned");
    return undefined;
  });
  await check("analyst", async () => {
    if (!aiEnabled()) return "skipped: AI off";
    if (await budgetPausedUntil()) return "skipped: budget paused";
    const rosa = await loadMerchant("rosas");
    if (!rosa) throw new Error("Demo cafe unavailable");
    const result = await structured({
      merchantId: rosa.id,
      feature: "soak",
      system: "This is an automated availability check. Answer with ok set to true.",
      user: "Is the service reachable?",
      schema: z.object({ ok: z.boolean() }),
      effort: "low",
      maxTokens: 400,
    });
    if (!result.value.ok) throw new Error("Unexpected answer");
    return undefined;
  });
  await check("demo-page", async () => {
    const r = await fetch(new URL("/demo", env.APP_URL), { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!r.ok || !(await r.text()).includes("Try Kickback")) throw new Error(`Demo page returned ${r.status}`);
    return undefined;
  });
  const failed = steps.find((s) => !s.ok);
  await getDb()
    .update(soakRuns)
    .set({ finishedAt: new Date(), ok: !failed, steps, failure: failed ? `${failed.name}: ${failed.detail ?? ""}` : null })
    .where(eq(soakRuns.id, row.id));
  if (!failed) await beat("soak", env.BETTERSTACK_SOAK_HEARTBEAT_URL);
  else console.error(JSON.stringify({ action: "soak_failed", step: failed.name }));
  return { ok: !failed, steps };
}
