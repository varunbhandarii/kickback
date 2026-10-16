import { Render } from "@renderinc/sdk";
import { getEnv } from "./env";
export function nightlyKey(now: Date) {
  return `nightly-${now.toISOString().slice(0, 10)}`;
}
export async function triggerReconcile(now = new Date()) {
  const env = getEnv();
  if (!env.RENDER_API_KEY || !env.WORKFLOW_SLUG)
    return { skipped: true as const };
  const run = await new Render({
    token: env.RENDER_API_KEY,
  }).workflows.startTask(`${env.WORKFLOW_SLUG}/nightlyReconcile`, [], {
    idempotencyKey: nightlyKey(now),
    signal: AbortSignal.timeout(4000),
  });
  console.info(
    JSON.stringify({ action: "workflow_started", taskRunId: run.taskRunId }),
  );
  return { taskRunId: run.taskRunId };
}
