import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { designRuns, suggestions, guardFlags } from "@/db/schema";
import type { DesignResult } from "@/lib/ai/designer/pipeline";
import type { ProgramSpec } from "@/lib/engine/program";

/**
 * The starting rule and design for the program editor: a pending weekly idea
 * (?suggestion=) or a Guard rule suggestion (?rule=) applied to the current spec.
 */
export async function editorStart(
  merchantId: string,
  spec: ProgramSpec | undefined,
  query: { suggestion?: string; rule?: string },
) {
  let initial = spec,
    initialDesign: (DesignResult & { id: string }) | undefined;
  if (query.suggestion && /^[0-9a-f-]{36}$/.test(query.suggestion)) {
    const [row] = await getDb()
      .select({ suggestion: suggestions, run: designRuns })
      .from(suggestions)
      .innerJoin(designRuns, eq(suggestions.designRunId, designRuns.id))
      .where(
        and(
          eq(suggestions.merchantId, merchantId),
          eq(suggestions.id, query.suggestion),
          eq(suggestions.status, "PENDING"),
        ),
      );
    if (row && row.run.expiresAt > new Date())
      initialDesign = { ...(row.run.result as DesignResult), id: row.run.id };
  }
  if (query.rule && initial && /^[0-9a-f-]{36}$/.test(query.rule)) {
    const [flag] = await getDb()
      .select()
      .from(guardFlags)
      .where(
        and(
          eq(guardFlags.merchantId, merchantId),
          eq(guardFlags.id, query.rule),
        ),
      );
    const change = (
      flag?.explanation as {
        suggested_rule_change?: { field: string; from: number; to: number };
      } | null
    )?.suggested_rule_change;
    if (
      change &&
      change.from === initial[change.field as keyof typeof initial] &&
      [
        "mergeWindowMin",
        "minTicketCents",
        "perCustomerMonthlyCapCents",
      ].includes(change.field)
    )
      initial = { ...initial, [change.field]: change.to };
  }
  return { initial, initialDesign };
}
