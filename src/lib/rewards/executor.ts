import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { captures, customers, merchants, offsets, rewards, settings, visits } from "@/db/schema";
import { audit, transitionLog } from "../audit";
import { getEnv } from "../env";
import { lockCustomer, lockMerchant } from "../ledger/locks";
import { applyRewardRefund } from "../ledger/clawback";
import { connectionContext, loadMerchant } from "../merchants";
import { PayPalApiError, type PayPalOptions } from "../paypal/client";
import { customerBudget, reserveCapture, rewardNetCents } from "./enqueue";
import { refundFailure } from "./errors";
type Refund = { id: string; status: string; amount: { value: string; currency_code: string } };
export type ExecutorDependencies = { request?: (path: string, options: PayPalOptions) => Promise<Refund>; mockCode?: string; deadline?: number; beforeRequest?: () => Promise<void>; interruptAfterResponse?: boolean };
export async function claimReward(id: string) {
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(rewards).where(and(eq(rewards.id,id),eq(rewards.state,"SCHEDULED"),lte(rewards.settleAt,new Date()))).limit(1).for("update",{ skipLocked: true });
    if (!row) return undefined;
    const [claimed] = await tx.update(rewards).set({ state: "SENDING", lockedAt: new Date(), lockedBy: randomUUID(), attempts: sql`${rewards.attempts}+1` }).where(eq(rewards.id,row.id)).returning();
    await audit(tx,row.merchantId,"reward.claimed",row.id,{ attempt: claimed.attempts });
    transitionLog(row.id,"SCHEDULED","SENDING");
    return claimed;
  });
}
export async function rewardsPaused() { if (getEnv().KICKBACK_PAUSE_REWARDS) return true; const [setting] = await getDb().select().from(settings).where(eq(settings.key,"rewards_paused")); return setting?.value === true; }
export async function settleReward(id: string, deps: ExecutorDependencies = {}) {
  if ((deps.mockCode || deps.interruptAfterResponse) && (getEnv().KICKBACK_ENV !== "sandbox" || !getEnv().DEMO_MODE)) throw new Error("Mock execution is sandbox only");
  const claimed = await claimReward(id);
  if (!claimed) return { claimed: false };
  const [merchantRow] = await getDb().select().from(merchants).where(eq(merchants.id,claimed.merchantId));
  const merchant = await loadMerchant(merchantRow.slug);
  const paused = await rewardsPaused();
  const prepared = await getDb().transaction(async (tx) => {
    await lockMerchant(tx,claimed.merchantId); await lockCustomer(tx,claimed.merchantId,claimed.customerKey);
    const [row] = await tx.select().from(rewards).where(eq(rewards.id,id)).for("update");
    if (row.state !== "SENDING" || row.lockedBy !== claimed.lockedBy) return undefined;
    const change = async (state: (typeof rewards.$inferSelect)["state"], reason: string, delay = 5*60000) => { await tx.update(rewards).set({ state, reason, settleAt: new Date(Date.now()+delay), lockedAt: null, lockedBy: null }).where(eq(rewards.id,id)); await audit(tx,claimed.merchantId,"reward.preflight",id,{ state,reason }); transitionLog(id,"SENDING",state,reason); return undefined; };
    const [currentMerchant] = await tx.select().from(merchants).where(eq(merchants.id,claimed.merchantId));
    if (paused || currentMerchant.status !== "ACTIVE" || currentMerchant.rewardsPaused || !merchant) return change("SCHEDULED","PAUSED");
    const [customer] = await tx.select().from(customers).where(and(eq(customers.merchantId,row.merchantId),eq(customers.key,row.customerKey)));
    if (customer.status !== "OK" || row.tier === "REVIEW") return change("HELD",customer.status === "EXCLUDED" ? "EXCLUDED" : row.tier === "REVIEW" ? "REVIEW" : "CUSTOMER_FROZEN");
    const [visit] = await tx.select().from(visits).where(eq(visits.id,row.visitId));
    if (visit.status === "VOID") return change("CANCELLED","CLAWBACK");
    const amount = rewardNetCents(row);
    if (amount <= 0) return change("OFFSET","OFFSET_APPLIED");
    const budget = await customerBudget(tx,merchant,row.customerKey,new Date(),row.id);
    if (budget.dailyUsedCents+amount > merchant.spec.dailyBudgetCents || budget.monthlyUsedCents+amount > merchant.spec.monthlyBudgetCents || budget.customerMonthlyUsedCents+amount > merchant.spec.perCustomerMonthlyCapCents) return change("HELD","BUDGET_CHANGED");
    const candidates = await tx.select().from(captures).where(eq(captures.visitId,row.visitId)).orderBy(asc(captures.capturedAt));
    if (row.captureId && !candidates.some((c) => c.id === row.captureId)) { const [retarget] = await tx.select().from(captures).where(eq(captures.id,row.captureId)); if (retarget?.customerKey === row.customerKey && retarget.merchantId === row.merchantId) candidates.unshift(retarget); }
    else candidates.sort((a,b) => Number(b.id === row.captureId)-Number(a.id === row.captureId));
    // An interrupted request must retry its original capture and key, even if
    // provider-side availability changed before the result reached our ledger.
    if (row.sendUncertain && row.captureId) return { ...row,captureId: row.captureId };
    for (const candidate of candidates) {
      if (["COMPLETED","PARTIALLY_REFUNDED"].includes(candidate.status) && candidate.refundCount < 25 && candidate.capturedAt.getTime() >= Date.now()-180*86400000) {
        const available = await reserveCapture(tx,candidate.id,row.id);
        if (available && available.availableCents >= amount) { await tx.update(rewards).set({ captureId: candidate.id,sendUncertain: true }).where(eq(rewards.id,id)); return { ...row,captureId: candidate.id }; }
      }
    }
    if (candidates.some((c) => c.status === "PENDING")) return change(Date.now()-row.createdAt.getTime() >= 72*3600000 ? "CANCELLED" : "SCHEDULED",Date.now()-row.createdAt.getTime() >= 72*3600000 ? "PENDING_TOO_LONG" : "PENDING_CAPTURE",15*60000);
    if (candidates.length && candidates.every((c) => c.capturedAt.getTime() < Date.now()-180*86400000)) return change("CANCELLED","TOO_OLD");
    await tx.insert(offsets).values({ merchantId: row.merchantId, customerKey: row.customerKey, amountCents: amount, remainingCents: amount, sourceRewardId: row.id, kind: "CREDIT" }).onConflictDoUpdate({ target: [offsets.sourceRewardId,offsets.kind],set: { amountCents: amount,remainingCents: amount } });
    return change("DEFERRED","NO_REFUNDABLE_CAPTURE");
  });
  if (!prepared) return { claimed: true, sent: false };
  try {
    const ctx = await connectionContext(claimed.merchantId);
    await deps.beforeRequest?.();
    if (await rewardsPaused()) throw new Error("REWARDS_PAUSED_BEFORE_SEND");
    const amount = rewardNetCents(prepared);
    const response = await (deps.request ?? ctx.client.request<Refund>)(`/v2/payments/captures/${prepared.captureId}/refund`, { method: "POST", merchantId: ctx.assertionMerchantId, requestId: prepared.requestId, priority: "normal", deadline: deps.deadline, mockCode: deps.mockCode, body: { amount: { value: (amount/100).toFixed(2), currency_code: "USD" }, custom_id: `KICKBACK:R:${prepared.id}`, note_to_payer: prepared.note } });
    if (response.amount.currency_code !== "USD" || Math.round(Number(response.amount.value)*100) !== amount) throw new Error("Refund amount mismatch");
    if (deps.interruptAfterResponse) {
      await getDb().update(rewards).set({ lockedAt: new Date(Date.now()-11*60000) }).where(and(eq(rewards.id,id),eq(rewards.state,"SENDING"),eq(rewards.lockedBy,claimed.lockedBy!)));
      await getDb().transaction((tx) => audit(tx,claimed.merchantId,"sandbox.interrupted_result",id,{},"operator"));
      return { claimed: true,interrupted: true,refundId: response.id,requestId: prepared.requestId };
    }
    await applyRewardRefund(id,{ id: response.id, status: response.status, amountCents: amount });
    return { claimed: true, sent: true, refundId: response.id, status: response.status };
  } catch (error) {
    const action = refundFailure(error,claimed.attempts);
    await getDb().transaction(async (tx) => {
      await lockMerchant(tx,claimed.merchantId); await lockCustomer(tx,claimed.merchantId,claimed.customerKey);
      const [row] = await tx.select().from(rewards).where(eq(rewards.id,id)).for("update");
      if (row.state !== "SENDING" || row.lockedBy !== claimed.lockedBy) return;
      let state = action.state, captureId = row.captureId, requestId = row.requestId;
      if (action.reason === "PENDING_CAPTURE" && Date.now()-row.createdAt.getTime() >= 72*3600000) state = "CANCELLED";
      if (action.fallback) {
        const alternatives = await tx.select().from(captures).where(and(eq(captures.visitId,row.visitId),inArray(captures.status,["COMPLETED","PARTIALLY_REFUNDED"])));
        const next = alternatives.find((c) => c.id !== row.captureId && c.refundableCents >= rewardNetCents(row) && c.refundCount < 25);
        if (next) { state = "SCHEDULED"; captureId = next.id; requestId = randomUUID(); }
        else await tx.insert(offsets).values({ merchantId: row.merchantId, customerKey: row.customerKey, amountCents: rewardNetCents(row), remainingCents: rewardNetCents(row), sourceRewardId: row.id, kind: "CREDIT" }).onConflictDoUpdate({ target: [offsets.sourceRewardId,offsets.kind],set: { amountCents: rewardNetCents(row),remainingCents: rewardNetCents(row) } });
      }
      if (action.freeze) await tx.update(customers).set({ status: "FROZEN", updatedAt: new Date() }).where(and(eq(customers.merchantId,row.merchantId),eq(customers.key,row.customerKey)));
      const uncertain = !(error instanceof PayPalApiError) || [409,429].includes(error.status) || error.status >= 500;
      await tx.update(rewards).set({ state, captureId, requestId, sendUncertain: action.reason === "PAUSED" ? claimed.sendUncertain : uncertain, reason: action.reason, lastError: action.reason, settleAt: new Date(Date.now()+(action.delayMs ?? 0)), lockedAt: null, lockedBy: null }).where(eq(rewards.id,id));
      await audit(tx,row.merchantId,"reward.attempt_result",id,{ state,reason: action.reason,debug_id: action.debugId });
      transitionLog(id,"SENDING",state,action.reason,action.debugId);
    });
    return { claimed: true, sent: false, issue: action.reason, debugId: action.debugId };
  }
}
export async function reapStale() {
  const updated = await getDb().update(rewards).set({ state: "SCHEDULED", settleAt: new Date(), lockedAt: null, lockedBy: null, reason: "STALE_CLAIM_RETRY" }).where(and(eq(rewards.state,"SENDING"),lte(rewards.lockedAt,new Date(Date.now()-10*60000)))).returning({ id: rewards.id });
  return updated.length;
}
export async function settleDue(limit = 25, deadline = Date.now()+45000) {
  const rows = await getDb().select({ id: rewards.id }).from(rewards).where(and(eq(rewards.state,"SCHEDULED"),lte(rewards.settleAt,new Date()))).orderBy(asc(rewards.settleAt)).limit(limit);
  let processed = 0;
  for (const row of rows) { if (Date.now() > deadline-5000) break; await settleReward(row.id,{ deadline: Math.min(deadline,Date.now()+20000) }); processed++; }
  return processed;
}
export async function confirmSent(deadline = Date.now()+45000) {
  const rows = await getDb().select().from(rewards).where(and(eq(rewards.state,"SENT"),lte(rewards.sentAt,new Date(Date.now()-10*60000)))).limit(25);
  let confirmed = 0;
  for (const reward of rows) {
    if (Date.now() > deadline-5000) break;
    if (!reward.refundId) continue;
    if (reward.sentAt && Date.now()-reward.sentAt.getTime() > 7*86400000) {
      await getDb().update(rewards).set({ state: "HELD",reason: "REFUND_CONFIRMATION_OVERDUE" }).where(and(eq(rewards.id,reward.id),eq(rewards.state,"SENT")));
      console.error(JSON.stringify({ reward_id: reward.id,action: "confirmation_overdue" })); continue;
    }
    try { const ctx = await connectionContext(reward.merchantId); const refund = await ctx.client.request<Refund>(`/v2/payments/refunds/${reward.refundId}`,{ priority: "low", deadline }); await applyRewardRefund(reward.id,{ id: refund.id,status: refund.status,amountCents: rewardNetCents(reward) }); if (refund.status === "COMPLETED") confirmed++; }
    catch (error) { console.error(JSON.stringify({ reward_id: reward.id, action: "confirmation_retry", issue: error instanceof PayPalApiError ? error.name : "UNAVAILABLE" })); }
  }
  return confirmed;
}
