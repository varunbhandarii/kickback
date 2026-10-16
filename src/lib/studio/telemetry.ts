import type { AgAiTelemetryObserver, AgAiTelemetryEvent } from "ag-studio";
export type RunMetric = {
  threadId: string;
  runId: string;
  parentRunId?: string;
  agentId: string;
  startedAt: number;
  finishedAt: number;
  status: "ok" | "error" | "cancelled";
  model?: string;
  turns: number;
  toolCalls: number;
  toolErrors: number;
  firstItemMs?: number;
};
export function analystObserver(): AgAiTelemetryObserver {
  const open = new Map<string, RunMetric>(),
    queue: RunMetric[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    while (queue.length) {
      const rows = queue.splice(0, 50);
      void fetch("/api/analyst/telemetry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rows),
        keepalive: true,
      }).catch(() => {});
    }
  };
  returnObserverVisibility(flush);
  return {
    onEvent(e: AgAiTelemetryEvent) {
      const t = e.trace;
      let r = open.get(t.runId);
      if (e.type === "run_started") {
        r = {
          threadId: t.threadId,
          runId: t.runId,
          parentRunId: t.parentRunId,
          agentId: t.agentId,
          startedAt: e.timestamp,
          finishedAt: e.timestamp,
          status: "ok",
          turns: 0,
          toolCalls: 0,
          toolErrors: 0,
        };
        open.set(t.runId, r);
      }
      if (!r) return;
      if (e.type === "turn_started") r.turns++;
      if (e.type === "item_started" && r.firstItemMs === undefined)
        r.firstItemMs = e.timestamp - r.startedAt;
      if (e.type === "turn_finished") r.model = e.model;
      if (e.type === "tool_execution_finished") {
        r.toolCalls++;
        if (!e.ok) r.toolErrors++;
      }
      if (e.type === "run_finished") {
        r.finishedAt = e.timestamp;
        r.status = e.status;
        open.delete(t.runId);
        queue.push(r);
        timer ??= setTimeout(() => {
          timer = undefined;
          flush();
        }, 2000);
      }
    },
  };
}
// One listener per page; recreated harnesses replace the callback rather than accumulating listeners.
let visibilityFlush: (() => void) | undefined;
let listening = false;
function returnObserverVisibility(flush: () => void) {
  visibilityFlush = flush;
  if (typeof document !== "undefined" && !listening) {
    listening = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") visibilityFlush?.();
    });
  }
}
