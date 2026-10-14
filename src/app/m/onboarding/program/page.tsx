import { requireMerchant } from "@/lib/dal";
import { loadMerchant } from "@/lib/merchants";
import ProgramForm from "./program-form";
import { aiEnabled } from "@/lib/ai/client";
import { prior } from "@/lib/ai/designer/context";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { designRuns, suggestions, guardFlags } from "@/db/schema";
import type { DesignResult } from "@/lib/ai/designer/pipeline";
export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ suggestion?: string; rule?: string }>;
}) {
  const { merchant } = await requireMerchant(),
    loaded = await loadMerchant(merchant.slug, true);
  const query = await searchParams;
  let initial = loaded?.spec,
    initialDesign: (DesignResult & { id: string }) | undefined;
  if (query.suggestion && /^[0-9a-f-]{36}$/.test(query.suggestion)) {
    const [row] = await getDb()
      .select({ suggestion: suggestions, run: designRuns })
      .from(suggestions)
      .innerJoin(designRuns, eq(suggestions.designRunId, designRuns.id))
      .where(
        and(
          eq(suggestions.merchantId, merchant.id),
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
          eq(guardFlags.merchantId, merchant.id),
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
  return (
    <ProgramForm
      merchantId={merchant.id}
      category={merchant.category}
      initial={initial}
      aiEnabled={aiEnabled()}
      margin={prior(merchant.category).marginPct}
      initialDesign={initialDesign}
    />
  );
}
