import { and, eq, gte, inArray, isNull, sql, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  captures,
  customers,
  guardFlags,
  merchants,
  notices,
  rewards,
} from "@/db/schema";
import { localDay } from "../engine/evaluate";
import { loadMerchant } from "../merchants";
export async function programMetrics(
  merchantId: string,
  days = 30,
  now = new Date(),
) {
  const from = new Date(+now - days * 86400000);
  const [payments, paid, flags] = await Promise.all([
    getDb()
      .select()
      .from(captures)
      .where(
        and(
          eq(captures.merchantId, merchantId),
          gte(captures.capturedAt, from),
          inArray(captures.status, [
            "COMPLETED",
            "PARTIALLY_REFUNDED",
            "REFUNDED",
          ]),
        ),
      ),
    getDb()
      .select()
      .from(rewards)
      .where(
        and(
          eq(rewards.merchantId, merchantId),
          gte(rewards.sentAt, from),
          inArray(rewards.state, ["SENT", "CONFIRMED"]),
        ),
      ),
    getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(guardFlags)
      .where(
        and(
          eq(guardFlags.merchantId, merchantId),
          eq(guardFlags.decision, "PENDING"),
        ),
      ),
  ]);
  const cost = paid.reduce(
      (s, r) => s + r.amountCents - r.offsetAppliedCents,
      0,
    ),
    revenue = payments.reduce((s, c) => s + c.amountCents, 0);
  return {
    rewardsPaid: paid.length,
    costCents: cost,
    payments: payments.length,
    revenueCents: revenue,
    refundCountRatio: paid.length / Math.max(1, payments.length),
    gmvRatio: cost / Math.max(1, revenue),
    earners: new Set(paid.map((r) => r.customerKey)).size,
    pendingReviews: flags[0].n,
  };
}
export async function refreshNotices(deadline = Date.now() + 45000) {
  const rows = await getDb()
    .select()
    .from(merchants)
    .where(eq(merchants.status, "ACTIVE"));
  let updated = 0;
  for (const merchant of rows) {
    if (Date.now() > deadline - 3000) break;
    const metrics = await programMetrics(merchant.id),
      loaded = await loadMerchant(merchant.slug, true);
    const [frozen] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, merchant.id),
          eq(customers.status, "FROZEN"),
        ),
      );
    const flags = await getDb()
      .select()
      .from(guardFlags)
      .where(
        and(
          eq(guardFlags.merchantId, merchant.id),
          eq(guardFlags.decision, "PENDING"),
        ),
      );
    const daily = await getDb()
      .select()
      .from(rewards)
      .where(
        and(
          eq(rewards.merchantId, merchant.id),
          gte(rewards.createdAt, new Date(Date.now() - 2 * 86400000)),
          inArray(rewards.state, [
            "SCHEDULED",
            "SENDING",
            "SENT",
            "CONFIRMED",
            "HELD",
            "DEFERRED",
          ]),
        ),
      );
    const burn = daily
      .filter(
        (r) =>
          localDay(r.createdAt, merchant.tz) ===
          localDay(new Date(), merchant.tz),
      )
      .reduce((s, r) => s + r.amountCents - r.offsetAppliedCents, 0);
    const alerts: { kind: string; severity: string; body: string }[] = [];
    if (metrics.refundCountRatio > 0.1)
      alerts.push({
        kind: "REFUND_RATIO",
        severity: metrics.refundCountRatio > 0.15 ? "warning" : "info",
        body: "Refund count exceeds 10% of payments in the last 30 days. Review your program.",
      });
    if (metrics.gmvRatio > 0.03)
      alerts.push({
        kind: "GMV_RATIO",
        severity: metrics.gmvRatio > 0.05 ? "warning" : "info",
        body: "Reward cost exceeds 3% of payment revenue in the last 30 days.",
      });
    if (loaded && burn >= loaded.spec.dailyBudgetCents * 0.8)
      alerts.push({
        kind: "DAILY_BUDGET",
        severity: "warning",
        body: "At least 80% of today's reward budget is committed.",
      });
    if (flags.some((f) => +f.createdAt < Date.now() - 86400000))
      alerts.push({
        kind: "REVIEW_OVERDUE",
        severity: "warning",
        body: "A reward has waited for review for more than 24 hours.",
      });
    if (frozen.n)
      alerts.push({
        kind: "FROZEN",
        severity: "info",
        body: `${frozen.n} customers have a frozen reward status. Review returns and disputes.`,
      });
    await getDb().transaction(async (tx) => {
      for (const alert of alerts) {
        const [existing] = await tx
          .select()
          .from(notices)
          .where(
            and(
              eq(notices.merchantId, merchant.id),
              eq(notices.kind, alert.kind),
              isNull(notices.readAt),
            ),
          );
        if (existing)
          await tx
            .update(notices)
            .set({ severity: alert.severity, body: alert.body })
            .where(eq(notices.id, existing.id));
        else
          await tx
            .insert(notices)
            .values({ merchantId: merchant.id, ...alert })
            .onConflictDoNothing();
      }
      const activeKinds = alerts.map((a) => a.kind);
      await tx
        .update(notices)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notices.merchantId, merchant.id),
            isNull(notices.readAt),
            ...(activeKinds.length
              ? [notInArray(notices.kind, activeKinds)]
              : []),
          ),
        );
    });
    updated++;
  }
  return updated;
}
