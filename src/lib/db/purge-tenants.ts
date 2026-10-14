import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLog,
  backfillRuns,
  captures,
  connections,
  customers,
  disputes,
  historyEvents,
  merchants,
  offsets,
  orders,
  rawEvents,
  refundReceipts,
  rewards,
  settings,
  visits,
  aiCalls,
  designRuns,
  guardFlags,
  notices,
  suggestions,
  programs,
} from "@/db/schema";
import { audit } from "../audit";
import { lockMerchant } from "../ledger/locks";
import { forgetConnection } from "../merchants";
export async function purgeTenants(now = new Date()) {
  const due = await getDb()
    .select()
    .from(merchants)
    .where(lt(merchants.purgeAfter, now));
  let purged = 0;
  for (const merchant of due)
    await getDb().transaction(async (tx) => {
      await lockMerchant(tx, merchant.id);
      const [current] = await tx
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchant.id));
      if (!current.purgeAfter || current.purgeAfter >= now) return;
      const captureIds = (
          await tx
            .select({ id: captures.id })
            .from(captures)
            .where(eq(captures.merchantId, merchant.id))
        ).map((r) => r.id),
        orderIds = (
          await tx
            .select({ id: orders.id })
            .from(orders)
            .where(eq(orders.merchantId, merchant.id))
        ).map((r) => r.id),
        refundIds = (
          await tx
            .select({ id: refundReceipts.id })
            .from(refundReceipts)
            .where(
              or(
                eq(refundReceipts.merchantId, merchant.id),
                ...(captureIds.length
                  ? [inArray(refundReceipts.captureId, captureIds)]
                  : []),
              ),
            )
        ).map((r) => r.id);
      // Raw webhooks are transient. Remove payloads linked to this tenant before
      // deleting the identifiers that let us locate them.
      const identifiers = [
        merchant.id,
        ...captureIds,
        ...orderIds,
        ...refundIds,
      ];
      for (const id of identifiers)
        await tx
          .delete(rawEvents)
          .where(sql`position(${id} in ${rawEvents.payload}::text) > 0`);
      await tx.delete(offsets).where(eq(offsets.merchantId, merchant.id));
      await tx.delete(guardFlags).where(eq(guardFlags.merchantId, merchant.id));
      await tx
        .delete(suggestions)
        .where(eq(suggestions.merchantId, merchant.id));
      await tx.delete(designRuns).where(eq(designRuns.merchantId, merchant.id));
      await tx.delete(aiCalls).where(eq(aiCalls.merchantId, merchant.id));
      await tx.delete(notices).where(eq(notices.merchantId, merchant.id));
      await tx
        .update(programs)
        .set({ provenance: {} })
        .where(eq(programs.merchantId, merchant.id));
      await tx.delete(rewards).where(eq(rewards.merchantId, merchant.id));
      await tx.delete(disputes).where(eq(disputes.merchantId, merchant.id));
      await tx
        .delete(refundReceipts)
        .where(
          or(
            eq(refundReceipts.merchantId, merchant.id),
            ...(captureIds.length
              ? [inArray(refundReceipts.captureId, captureIds)]
              : []),
          ),
        );
      await tx.delete(captures).where(eq(captures.merchantId, merchant.id));
      await tx.delete(orders).where(eq(orders.merchantId, merchant.id));
      await tx.delete(visits).where(eq(visits.merchantId, merchant.id));
      await tx.delete(customers).where(eq(customers.merchantId, merchant.id));
      await tx
        .delete(historyEvents)
        .where(eq(historyEvents.merchantId, merchant.id));
      await tx
        .delete(backfillRuns)
        .where(eq(backfillRuns.merchantId, merchant.id));
      await tx
        .delete(settings)
        .where(sql`position(${merchant.id} in ${settings.key}) > 0`);
      await tx
        .delete(connections)
        .where(eq(connections.merchantId, merchant.id));
      await tx
        .update(auditLog)
        .set({ subject: "tenant", details: {}, actor: "system" })
        .where(eq(auditLog.merchantId, merchant.id));
      await tx
        .update(merchants)
        .set({
          status: "DISCONNECTED",
          rewardsPaused: true,
          purgeAfter: null,
          stats: {},
          statsUpdatedAt: null,
          voiceHints: "",
          onboardingStep: "connect",
        })
        .where(eq(merchants.id, merchant.id));
      await audit(tx, merchant.id, "merchant.purged", "tenant");
      forgetConnection(merchant.id);
      purged++;
    });
  return purged;
}
export async function purgeOperationalMetadata(now = new Date()) {
  const keys = await getDb()
    .delete(settings)
    .where(
      and(
        sql`${settings.key} like 'order:%'`,
        lt(settings.updatedAt, new Date(+now - 7 * 86400000)),
      ),
    )
    .returning({ key: settings.key });
  const audits = await getDb()
    .delete(auditLog)
    .where(lt(auditLog.at, new Date(+now - 90 * 86400000)))
    .returning({ id: auditLog.id });
  const invitations = await getDb()
    .delete(settings)
    .where(
      and(
        sql`${settings.key} like 'invite:%'`,
        sql`${settings.value}->>'expiresAt' < ${now.toISOString()}`,
      ),
    )
    .returning({ key: settings.key });
  const expired = await getDb()
    .select({ id: designRuns.id })
    .from(designRuns)
    .where(lt(designRuns.expiresAt, now));
  if (expired.length) {
    await getDb().transaction(async (tx) => {
      await tx
        .update(suggestions)
        .set({ status: "EXPIRED", designRunId: null })
        .where(
          inArray(
            suggestions.designRunId,
            expired.map((r) => r.id),
          ),
        );
      await tx.delete(designRuns).where(
        inArray(
          designRuns.id,
          expired.map((r) => r.id),
        ),
      );
    });
  }
  await getDb()
    .delete(aiCalls)
    .where(lt(aiCalls.createdAt, new Date(+now - 90 * 86400000)));
  await getDb()
    .delete(notices)
    .where(
      and(
        lt(notices.createdAt, new Date(+now - 90 * 86400000)),
        sql`${notices.readAt} is not null`,
      ),
    );
  return {
    orderKeys: keys.length,
    audits: audits.length,
    ...(invitations.length ? { invitations: invitations.length } : {}),
  };
}
