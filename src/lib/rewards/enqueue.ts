import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db";
import {
  backfillRuns,
  captures,
  connections,
  customers,
  merchants,
  offsets,
  rewards,
  visits,
} from "@/db/schema";
import { audit } from "../audit";
import {
  evaluate,
  localDay,
  type Budget,
  type Progress,
} from "../engine/evaluate";
import { rewardNote } from "../engine/program";
import type { Merchant } from "../merchants";
const budgetStates = [
  "SCHEDULED",
  "SENDING",
  "SENT",
  "CONFIRMED",
  "HELD",
  "DEFERRED",
] as const;
export async function customerBudget(
  tx: Tx,
  merchant: Merchant,
  key: string,
  now: Date,
  excludeRewardId?: string,
): Promise<Budget> {
  const rows = await tx
    .select()
    .from(rewards)
    .where(
      and(
        eq(rewards.merchantId, merchant.id),
        inArray(rewards.state, [...budgetStates]),
      ),
    );
  const day = localDay(now, merchant.tz),
    month = day.slice(0, 7);
  return rows
    .filter((r) => r.id !== excludeRewardId)
    .reduce(
      (budget, r) => {
        const when = localDay(r.createdAt, merchant.tz),
          amount = r.amountCents - r.offsetAppliedCents;
        if (when === day) budget.dailyUsedCents += amount;
        if (when.startsWith(month)) {
          budget.monthlyUsedCents += amount;
          if (r.customerKey === key) budget.customerMonthlyUsedCents += amount;
        }
        return budget;
      },
      { dailyUsedCents: 0, monthlyUsedCents: 0, customerMonthlyUsedCents: 0 },
    );
}
export async function enqueue(
  tx: Tx,
  merchant: Merchant,
  key: string,
  now = new Date(),
  rewardableFrom?: Date,
) {
  const history = await tx
    .select()
    .from(visits)
    .where(
      and(eq(visits.merchantId, merchant.id), eq(visits.customerKey, key)),
    );
  const previous = await tx
    .select()
    .from(rewards)
    .where(
      and(eq(rewards.merchantId, merchant.id), eq(rewards.customerKey, key)),
    );
  const [importing] = await tx
    .select({ to: backfillRuns.windowTo, status: backfillRuns.status })
    .from(backfillRuns)
    .where(
      and(
        eq(backfillRuns.merchantId, merchant.id),
        eq(backfillRuns.kind, "BACKFILL"),
      ),
    )
    .orderBy(desc(backfillRuns.windowTo))
    .limit(1);
  if (
    !rewardableFrom &&
    importing &&
    ["QUEUED", "RUNNING"].includes(importing.status)
  ) {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(
        and(eq(customers.merchantId, merchant.id), eq(customers.key, key)),
      );
    const [latest] = await tx
      .select()
      .from(rewards)
      .where(
        and(eq(rewards.merchantId, merchant.id), eq(rewards.customerKey, key)),
      )
      .orderBy(desc(rewards.createdAt))
      .limit(1);
    return {
      progress: (customer?.progress as Progress)?.type
        ? (customer!.progress as Progress)
        : evaluate(
            merchant.spec,
            history,
            previous,
            await customerBudget(tx, merchant, key, now),
            now,
            merchant.tz,
            {
              rewardableFrom: new Date(
                Math.max(
                  merchant.program.effectiveFrom.getTime(),
                  importing.to.getTime(),
                ),
              ),
            },
          ).progress,
      rewards: [] as (typeof rewards.$inferSelect)[],
      latestReward: latest,
    };
  }
  const boundary = new Date(
    Math.max(
      merchant.program.effectiveFrom.getTime(),
      rewardableFrom?.getTime() ?? 0,
      importing?.to.getTime() ?? 0,
    ),
  );
  const result = evaluate(
    merchant.spec,
    history,
    previous,
    await customerBudget(tx, merchant, key, now),
    now,
    merchant.tz,
    { rewardableFrom: boundary },
  );
  const [customer] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.merchantId, merchant.id), eq(customers.key, key)));
  const [business] = await tx
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchant.id)),
    [connection] = await tx
      .select()
      .from(connections)
      .where(eq(connections.merchantId, merchant.id));
  const disconnected =
    Boolean(business?.purgeAfter) ||
    business?.status === "DISCONNECTED" ||
    ["DISCONNECTED", "REVOKED"].includes(connection?.status ?? "");
  const inserted: (typeof rewards.$inferSelect)[] = [];
  for (const item of [
    ...result.intents,
    ...result.consumed.map((v) => ({
      ...v,
      amountCents: merchant.spec.rewardCents,
      blocked: true,
    })),
  ]) {
    if (previous.some((r) => r.visitId === item.visitId)) continue;
    const [capture] = await tx
      .select()
      .from(captures)
      .where(eq(captures.visitId, item.visitId))
      .orderBy(desc(captures.refundableCents))
      .limit(1);
    let applied = 0;
    const blocked =
      "blocked" in item || customer?.status === "EXCLUDED" || disconnected;
    if (!blocked) {
      const debts = await tx
        .select()
        .from(offsets)
        .where(
          and(
            eq(offsets.merchantId, merchant.id),
            eq(offsets.customerKey, key),
            eq(offsets.kind, "DEBIT"),
          ),
        )
        .orderBy(offsets.createdAt)
        .for("update");
      for (const debt of debts) {
        const used = Math.min(item.amountCents - applied, debt.remainingCents);
        if (used > 0) {
          applied += used;
          await tx
            .update(offsets)
            .set({ remainingCents: debt.remainingCents - used })
            .where(eq(offsets.id, debt.id));
        }
      }
    }
    const state = blocked
      ? "CANCELLED"
      : applied === item.amountCents
        ? "OFFSET"
        : customer?.status !== "OK" || merchant.spec.settlement === "REVIEW"
          ? "HELD"
          : "SCHEDULED";
    const [row] = await tx
      .insert(rewards)
      .values({
        id: randomUUID(),
        merchantId: merchant.id,
        customerKey: key,
        programId: merchant.program.id,
        visitId: item.visitId,
        captureId: capture?.id,
        amountCents: item.amountCents,
        basisVisitIds: item.basisVisitIds,
        offsetAppliedCents: applied,
        state,
        tier: merchant.spec.settlement,
        requestId: randomUUID(),
        note: rewardNote(merchant.spec, merchant.displayName),
        reason: disconnected
          ? "DISCONNECTED"
          : customer?.status === "EXCLUDED"
            ? "EXCLUDED"
            : blocked
              ? item.reason
              : state === "HELD"
                ? customer?.status !== "OK"
                  ? "CUSTOMER_FROZEN"
                  : "REVIEW"
                : item.reason,
        settleAt: new Date(
          now.getTime() +
            (merchant.spec.settlement === "DELAYED" ? 86400000 : 0),
        ),
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (row) {
      inserted.push(row);
      await audit(tx, merchant.id, "reward.enqueued", row.id, {
        state: row.state,
        reason: row.reason,
      });
    }
  }
  const progress: Progress = result.progress;
  await tx
    .update(customers)
    .set({ progress, updatedAt: now })
    .where(and(eq(customers.merchantId, merchant.id), eq(customers.key, key)));
  const [latest] = await tx
    .select()
    .from(rewards)
    .where(
      and(eq(rewards.merchantId, merchant.id), eq(rewards.customerKey, key)),
    )
    .orderBy(desc(rewards.createdAt))
    .limit(1);
  return { progress, rewards: inserted, latestReward: latest };
}
export async function awakenDeferred(
  tx: Tx,
  merchantId: string,
  key: string,
  captureId: string,
) {
  const due = await tx
    .select()
    .from(rewards)
    .where(
      and(
        eq(rewards.merchantId, merchantId),
        eq(rewards.customerKey, key),
        eq(rewards.state, "DEFERRED"),
      ),
    )
    .for("update");
  for (const reward of due) {
    await tx
      .update(rewards)
      .set({
        state: "SCHEDULED",
        captureId,
        requestId: randomUUID(),
        settleAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        reason: "DEFERRED_CREDIT_RETRY",
      })
      .where(eq(rewards.id, reward.id));
    await audit(tx, merchantId, "reward.credit_retargeted", reward.id, {
      reason: "NEW_CAPTURE_AFTER_DEFINITIVE_REJECTION",
    });
    await tx
      .update(offsets)
      .set({ remainingCents: 0 })
      .where(
        and(eq(offsets.sourceRewardId, reward.id), eq(offsets.kind, "CREDIT")),
      );
  }
}
export async function reserveCapture(
  tx: Tx,
  captureId: string,
  rewardId: string,
) {
  const [capture] = await tx
    .select()
    .from(captures)
    .where(eq(captures.id, captureId))
    .for("update");
  if (!capture) return undefined;
  const held = await tx
    .select()
    .from(rewards)
    .where(and(eq(rewards.captureId, captureId), eq(rewards.state, "SENDING")));
  const reserved = held
    .filter((r) => r.id !== rewardId)
    .reduce((sum, r) => sum + r.amountCents - r.offsetAppliedCents, 0);
  return { ...capture, availableCents: capture.refundableCents - reserved };
}
export const rewardNetCents = (
  reward: Pick<
    typeof rewards.$inferSelect,
    "amountCents" | "offsetAppliedCents"
  >,
) => reward.amountCents - reward.offsetAppliedCents;
