import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  n = z.number().int().min(0).max(100000);
export const telemetrySchema = z
  .array(
    z
      .strictObject({
        threadId: id,
        runId: id,
        parentRunId: id.optional(),
        agentId: id,
        startedAt: z.number().int().positive(),
        finishedAt: z.number().int().positive(),
        status: z.enum(["ok", "error", "cancelled"]),
        model: z
          .string()
          .regex(/^[A-Za-z0-9_.:-]{1,80}$/)
          .optional(),
        turns: n,
        toolCalls: n,
        toolErrors: n,
        firstItemMs: n.optional(),
      })
      .refine(
        (r) =>
          r.finishedAt >= r.startedAt &&
          r.finishedAt - r.startedAt <= 86400000 &&
          r.finishedAt <= Date.now() + 60000 &&
          r.startedAt >= Date.now() - 86400000,
        "Invalid run dates",
      ),
  )
  .min(1)
  .max(50);
export async function saveTelemetry(
  merchantId: string,
  rows: z.infer<typeof telemetrySchema>,
) {
  for (const r of rows)
    await getDb().execute(
      sql`insert into ai_usage(merchant_id,run_id,thread_id,parent_run_id,agent_id,started_at,finished_at,status,model,turns,tool_calls,tool_errors,first_item_ms) values(${merchantId},${r.runId},${r.threadId},${r.parentRunId ?? null},${r.agentId},${new Date(r.startedAt).toISOString()}::timestamptz,${new Date(r.finishedAt).toISOString()}::timestamptz,${r.status},${r.model ?? null},${r.turns},${r.toolCalls},${r.toolErrors},${r.firstItemMs ?? null}) on conflict(merchant_id,run_id) do update set finished_at=excluded.finished_at,status=excluded.status,turns=excluded.turns,tool_calls=excluded.tool_calls,tool_errors=excluded.tool_errors,first_item_ms=excluded.first_item_ms`,
    );
}
