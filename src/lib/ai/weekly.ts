import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  merchants,
  programs,
  suggestions,
  visits,
  settings,
} from "@/db/schema";
import { aiEnabled } from "./client";
import { createDesign } from "./service";
import { prior } from "./designer/context";
import { lockMerchant } from "../ledger/locks";
export async function weeklySuggestions(deadline = Date.now() + 45000) {
  if (!aiEnabled()) return 0;
  let created = 0;
  const rows = await getDb()
    .select()
    .from(merchants)
    .where(eq(merchants.status, "ACTIVE"));
  for (const merchant of rows) {
    if (Date.now() > deadline - 10000) break;
    const [last] = await getDb()
      .select()
      .from(suggestions)
      .where(eq(suggestions.merchantId, merchant.id))
      .orderBy(desc(suggestions.createdAt))
      .limit(1);
    if (
      last &&
      (last.status === "PENDING" || +last.createdAt > Date.now() - 7 * 86400000)
    )
      continue;
    const [active] = await getDb()
      .select()
      .from(programs)
      .where(
        and(
          eq(programs.merchantId, merchant.id),
          eq(programs.status, "ACTIVE"),
        ),
      );
    if (!active) continue;
    const [count] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(visits)
      .where(
        and(
          eq(visits.merchantId, merchant.id),
          eq(visits.status, "COMPLETED"),
          ne(visits.source, "FIXTURE"),
          gte(visits.startedAt, new Date(Date.now() - 30 * 86400000)),
          gte(
            visits.amountCents,
            (active.spec as { minTicketCents?: number }).minTicketCents ?? 100,
          ),
        ),
      );
    if (count.n < 20) continue;
    const leaseKey = "ai-weekly:" + merchant.id;
    const claimed = await getDb().transaction(async (tx) => {
      await lockMerchant(tx, merchant.id);
      const [lease] = await tx
        .select()
        .from(settings)
        .where(eq(settings.key, leaseKey));
      if (
        lease &&
        (lease.value as { until?: string }).until &&
        Date.parse((lease.value as { until: string }).until) > Date.now()
      )
        return false;
      const [latest] = await tx
        .select()
        .from(suggestions)
        .where(eq(suggestions.merchantId, merchant.id))
        .orderBy(desc(suggestions.createdAt))
        .limit(1);
      if (
        latest &&
        (latest.status === "PENDING" ||
          +latest.createdAt > Date.now() - 7 * 86400000)
      )
        return false;
      await tx
        .insert(settings)
        .values({
          key: leaseKey,
          value: { until: new Date(Date.now() + 90000).toISOString() },
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: { until: new Date(Date.now() + 90000).toISOString() },
            updatedAt: new Date(),
          },
        });
      return true;
    });
    if (!claimed) continue;
    let stored = false;
    const spec = active.spec as {
      type: string;
      n?: number;
      spendCents?: number;
      monthlyBudgetCents: number;
      rewardCents: number;
    };
    const provenance = active.provenance as {
      goal?: string;
      marginPct?: number;
      liftAssumptionPct?: number;
    };
    try {
      const design = await createDesign(
        merchant.id,
        {
          goal:
            provenance.goal ??
            "Suggest one measured improvement for next month, preserving the merchant budget.",
          budgetCents: spec.monthlyBudgetCents,
          marginPct: provenance.marginPct ?? prior(merchant.category).marginPct,
          liftAssumptionPct: provenance.liftAssumptionPct ?? 5,
        },
        undefined,
        AbortSignal.timeout(Math.max(1, deadline - Date.now() - 3000)),
      );
      const candidate = design.cards.find(
        (c) =>
          c.acceptable &&
          (c.params.type !== spec.type ||
            c.params.n !== spec.n ||
            c.params.spend_cents !== spec.spendCents ||
            c.params.reward_cents !== spec.rewardCents),
      );
      if (candidate && !design.fallback) {
        await getDb()
          .insert(suggestions)
          .values({
            merchantId: merchant.id,
            designRunId: design.id,
            candidateId: candidate.params.id,
          })
          .onConflictDoNothing();
        created++;
        stored = true;
      }
    } catch {
      /* A scheduled suggestion never blocks payment recovery. */
    } finally {
      await getDb()
        .update(settings)
        .set({
          value: {
            until: new Date(
              Date.now() + (stored ? 7 : 1) * 86400000,
            ).toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(settings.key, leaseKey));
    }
  }
  return created;
}
