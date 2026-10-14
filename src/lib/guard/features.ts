import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { captures, customers, offsets, rewards, visits } from "@/db/schema";
import type { Merchant } from "../merchants";
import { localDay } from "../engine/evaluate";
import { quantile } from "../engine/simulate";
import type { GuardFeatures } from "./score";
export async function guardFeatures(
  tx: Tx,
  merchant: Merchant,
  key: string,
  visitId: string,
  now: Date,
): Promise<GuardFeatures> {
  const [history, payments, past, debts, [person]] = await Promise.all([
    tx
      .select()
      .from(visits)
      .where(
        and(eq(visits.merchantId, merchant.id), eq(visits.customerKey, key)),
      ),
    tx
      .select()
      .from(captures)
      .where(
        and(
          eq(captures.merchantId, merchant.id),
          eq(captures.visitId, visitId),
        ),
      ),
    tx.select().from(rewards).where(eq(rewards.merchantId, merchant.id)),
    tx
      .select()
      .from(offsets)
      .where(
        and(
          eq(offsets.merchantId, merchant.id),
          eq(offsets.customerKey, key),
          eq(offsets.kind, "DEBIT"),
        ),
      ),
    tx
      .select()
      .from(customers)
      .where(
        and(eq(customers.merchantId, merchant.id), eq(customers.key, key)),
      ),
  ]);
  const completed = history.filter(
      (v) =>
        v.status === "COMPLETED" &&
        v.source !== "FIXTURE" &&
        v.startedAt <= now,
    ),
    target = completed.find((v) => v.id === visitId);
  const personal = past.filter((r) => r.customerKey === key),
    day = localDay(now, merchant.tz);
  const provenance = merchant.program.provenance as {
    selectedMetrics?: { dailyMeanCostCents?: number };
  };
  return {
    mergedCaptures: payments.filter((c) => !c.id.startsWith("fx:")).length,
    visitsToday: completed.filter(
      (v) => localDay(v.startedAt, merchant.tz) === day,
    ).length,
    customerAgeDays: person
      ? Math.max(0, (+now - +person.firstSeen) / 86400000)
      : 0,
    completedVisits: completed.length,
    ticketCents: target?.amountCents ?? 0,
    medianTicketCents: quantile(
      completed.filter((v) => v.id !== visitId).map((v) => v.amountCents),
      0.5,
    ),
    priorClawback: debts.length > 0,
    priorDeclinedOrHeld: personal.some(
      (r) =>
        r.state === "HELD" ||
        (r.state === "CANCELLED" && r.reason === "DECLINED"),
    ),
    rewardsLast7Days: personal.filter(
      (r) =>
        r.createdAt <= now &&
        +r.createdAt >= +now - 7 * 86400000 &&
        ["SENT", "CONFIRMED"].includes(r.state),
    ).length,
    minTicketCents: merchant.spec.minTicketCents,
    dayBudgetBurnCents: past
      .filter(
        (r) =>
          localDay(r.createdAt, merchant.tz) === day &&
          [
            "SCHEDULED",
            "SENDING",
            "SENT",
            "CONFIRMED",
            "HELD",
            "DEFERRED",
          ].includes(r.state),
      )
      .reduce((s, r) => s + r.amountCents - r.offsetAppliedCents, 0),
    simulatedDailyMeanCents:
      provenance.selectedMetrics?.dailyMeanCostCents ?? 0,
  };
}
