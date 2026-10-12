import { and, eq, or, sql } from "drizzle-orm";
import { getDb, type Tx } from "@/db";
import { captures, customers, merchants, offsets, refundReceipts, rewards, visits } from "@/db/schema";
import { audit, transitionLog } from "../audit";
import { loadMerchant, type Merchant } from "../merchants";
import { enqueue, rewardNetCents } from "../rewards/enqueue";
import { lockCustomer, lockMerchant } from "./locks";
import { recomputeVisit } from "./record-capture";
export async function addClawbackOffset(tx: Tx, reward: typeof rewards.$inferSelect) {
  const amount = rewardNetCents(reward);
  if (amount > 0) await tx.insert(offsets).values({ merchantId: reward.merchantId, customerKey: reward.customerKey, amountCents: amount, remainingCents: amount, sourceRewardId: reward.id, kind: "DEBIT" }).onConflictDoNothing();
}
export async function invalidateVisit(tx: Tx, merchant: Merchant, visitId: string) {
  await tx.update(visits).set({ status: "VOID" }).where(eq(visits.id,visitId));
  const related = await tx.select().from(rewards).where(and(eq(rewards.merchantId,merchant.id),or(eq(rewards.visitId,visitId),sql`${visitId}::uuid = any(${rewards.basisVisitIds})`))).for("update");
  for (const reward of related) {
    if (["SENT","CONFIRMED"].includes(reward.state)) await addClawbackOffset(tx,reward);
    else if (["EARNED","SCHEDULED","HELD","DEFERRED"].includes(reward.state)) {
      await tx.update(rewards).set({ state: "CANCELLED", reason: "CLAWBACK", lockedAt: null, lockedBy: null }).where(eq(rewards.id,reward.id));
      await tx.update(offsets).set({ remainingCents: 0 }).where(and(eq(offsets.sourceRewardId,reward.id),eq(offsets.kind,"CREDIT")));
    } else if (reward.state === "SENDING") await tx.update(rewards).set({ reason: "IN_FLIGHT_CLAWBACK" }).where(eq(rewards.id,reward.id));
    await audit(tx,merchant.id,"reward.clawback",reward.id,{ state: reward.state });
  }
}
export async function foreignRefundTx(tx: Tx, merchant: Merchant, captureId: string, refundId: string, amountCents: number, reversed = false) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Invalid foreign refund amount");
    const [capture] = await tx.select().from(captures).where(eq(captures.id,captureId)).for("update");
    if (!capture || capture.merchantId !== merchant.id) throw new Error("Capture unavailable for refund");
    if (capture.customerKey) await lockCustomer(tx,merchant.id,capture.customerKey);
    const [existing] = await tx.select().from(refundReceipts).where(eq(refundReceipts.id,refundId)).for("update");
    if (existing?.appliedAt) return { duplicate: true };
    if (existing && (existing.captureId !== captureId || existing.amountCents !== amountCents)) throw new Error("Foreign refund context mismatch");
    await tx.insert(refundReceipts).values({ id: refundId, captureId, amountCents, kind: reversed ? "REVERSAL" : "FOREIGN", status: "COMPLETED", appliedAt: new Date() }).onConflictDoUpdate({ target: refundReceipts.id,set: { appliedAt: new Date() } });
    const refundable = Math.max(0,capture.refundableCents-amountCents), foreign = Math.min(capture.amountCents,capture.foreignRefundedCents+amountCents);
    await tx.update(captures).set({ refundableCents: refundable, foreignRefundedCents: foreign, refundCount: sql`${captures.refundCount}+1`, status: reversed ? "REVERSED" : refundable === 0 ? "REFUNDED" : "PARTIALLY_REFUNDED", updatedAt: new Date() }).where(eq(captures.id,captureId));
    if (capture.visitId && capture.customerKey) {
      const visit = await recomputeVisit(tx,capture.visitId);
      if (reversed || foreign >= capture.amountCents || visit.amountCents < merchant.spec.minTicketCents) await invalidateVisit(tx,merchant,visit.id);
      if (reversed) { await tx.update(customers).set({ status: "FROZEN", updatedAt: new Date() }).where(and(eq(customers.merchantId,merchant.id),eq(customers.key,capture.customerKey))); await tx.update(rewards).set({ state: "HELD", reason: "CAPTURE_REVERSED" }).where(and(eq(rewards.merchantId,merchant.id),eq(rewards.customerKey,capture.customerKey),eq(rewards.state,"SCHEDULED"))); }
      await enqueue(tx,merchant,capture.customerKey);
    }
    await audit(tx,merchant.id,"capture.foreign_refund",captureId,{ refund_id: refundId, reversed });
    return { duplicate: false };
}
export async function foreignRefund(merchant: Merchant, captureId: string, refundId: string, amountCents: number, reversed = false) {
  return getDb().transaction(async (tx) => { await lockMerchant(tx,merchant.id); return foreignRefundTx(tx,merchant,captureId,refundId,amountCents,reversed); });
}
export async function reconcilePendingRefunds(tx: Tx, merchant: Merchant, captureId: string) {
  const [uncertain] = await tx.select({ id: rewards.id }).from(rewards).where(and(eq(rewards.captureId,captureId),eq(rewards.sendUncertain,true))).limit(1);
  if (uncertain) return;
  const pending = await tx.select().from(refundReceipts).where(and(eq(refundReceipts.captureId,captureId),sql`${refundReceipts.appliedAt} is null`,eq(refundReceipts.status,"COMPLETED"),sql`${refundReceipts.kind} in ('FOREIGN','REVERSAL')`));
  for (const row of pending) await foreignRefundTx(tx,merchant,captureId,row.id,row.amountCents,row.kind === "REVERSAL");
}
export async function applyRewardRefund(rewardId: string, refund: { id: string; status: string; amountCents: number }) {
  const [known] = await getDb().select().from(rewards).where(eq(rewards.id,rewardId));
  if (!known) return false;
  const [merchantRow] = await getDb().select().from(merchants).where(eq(merchants.id,known.merchantId));
  const merchant = await loadMerchant(merchantRow.slug,true);
  if (!merchant) throw new Error("Reward merchant unavailable");
  return getDb().transaction(async (tx) => {
    await lockMerchant(tx,known.merchantId); await lockCustomer(tx,known.merchantId,known.customerKey);
    const [reward] = await tx.select().from(rewards).where(eq(rewards.id,rewardId)).for("update");
    if (!reward.captureId || rewardNetCents(reward) !== refund.amountCents || (reward.refundId && reward.refundId !== refund.id)) throw new Error("Refund context mismatch");
    const [old] = await tx.select().from(refundReceipts).where(eq(refundReceipts.id,refund.id)).for("update");
    if (old && old.captureId !== reward.captureId) throw new Error("Refund capture mismatch");
    if (old?.kind === "REWARD" && (old.status === "COMPLETED" || old.status === "FAILED")) return true;
    const [capture] = await tx.select().from(captures).where(eq(captures.id,reward.captureId)).for("update");
    const failed = ["FAILED","CANCELLED"].includes(refund.status), completed = refund.status === "COMPLETED";
    const state = failed ? "FAILED" : completed ? "CONFIRMED" : "SENT";
    if (!old?.appliedAt && !failed) await tx.update(captures).set({ refundableCents: Math.max(0,capture.refundableCents-refund.amountCents), refundCount: sql`${captures.refundCount}+1`, updatedAt: new Date() }).where(eq(captures.id,capture.id));
    if (old?.appliedAt && failed) await tx.update(captures).set({ refundableCents: Math.min(capture.amountCents,capture.refundableCents+refund.amountCents), updatedAt: new Date() }).where(eq(captures.id,capture.id));
    await tx.insert(refundReceipts).values({ id: refund.id, captureId: capture.id, amountCents: refund.amountCents, kind: "REWARD", status: failed ? "FAILED" : refund.status, appliedAt: failed ? null : new Date() }).onConflictDoUpdate({ target: refundReceipts.id, set: { kind: "REWARD",status: failed ? "FAILED" : refund.status,appliedAt: failed ? null : old?.appliedAt ?? new Date() } });
    await tx.update(rewards).set({ state, refundId: refund.id, sendUncertain: false, sentAt: reward.sentAt ?? new Date(), confirmedAt: completed ? new Date() : null, lockedAt: null, lockedBy: null, reason: failed ? "REFUND_FAILED" : reward.reason }).where(eq(rewards.id,reward.id));
    const [visit] = await tx.select().from(visits).where(eq(visits.id,reward.visitId));
    if (!failed && visit.status === "VOID") await addClawbackOffset(tx,reward);
    await audit(tx,merchant.id,completed ? "reward.confirmed" : failed ? "reward.failed" : "reward.sent",reward.id,{ refund_id: refund.id });
    await enqueue(tx,merchant,reward.customerKey);
    transitionLog(reward.id,reward.state,state,failed ? "REFUND_FAILED" : undefined);
    return true;
  });
}
