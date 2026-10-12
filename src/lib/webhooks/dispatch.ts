import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { captures, connections, customers, disputes, merchants, orders, rawEvents, refundReceipts, rewards, webhookEvents } from "@/db/schema";
import { audit } from "../audit";
import { applyRewardRefund, foreignRefund, invalidateVisit } from "../ledger/clawback";
import { lockCustomer, lockMerchant } from "../ledger/locks";
import { markCaptureStatus, parseCents, recordCapture, type CaptureOrder } from "../ledger/record-capture";
import { connectionContext, loadMerchant, type Merchant } from "../merchants";
import { PayPalApiError } from "../paypal/client";
import type { WebhookEvent } from "../paypal/webhooks";
import { enqueue, rewardNetCents } from "../rewards/enqueue";
import { settleReward } from "../rewards/executor";

type Resource = { id?: string; status?: string; custom_id?: string; merchant_id?: string; amount?: { value: string; currency_code: string }; update_time?: string; supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } }; links?: { rel: string; href: string }[]; disputed_transactions?: { seller_transaction_id?: string }[]; dispute_outcome?: { outcome_code?: string } };
function captureLink(resource: Resource) { const href = resource.links?.find((l) => l.rel === "up")?.href; if (!href) return undefined; const url = new URL(href); if (!/^(api|api-m)\.(sandbox\.)?paypal\.com$/.test(url.hostname)) return undefined; return url.pathname.match(/^\/v2\/payments\/captures\/([A-Z0-9]+)$/)?.[1]; }
async function merchantById(id: string) { const [row] = await getDb().select().from(merchants).where(eq(merchants.id,id)); return row ? loadMerchant(row.slug,true) : undefined; }
async function knownCapture(id: string) { const [capture] = await getDb().select().from(captures).where(eq(captures.id,id)); return capture; }
async function unresolvedRefund(captureId: string) { const rows = await getDb().select({ id: rewards.id }).from(rewards).where(and(eq(rewards.captureId,captureId),eq(rewards.sendUncertain,true))).limit(1); return rows.length > 0; }
async function recordUnknown(orderId: string, resource: Resource, eventType: string, deadline: number) {
  let fetchedOrder: CaptureOrder | undefined;
  let [stored] = await getDb().select().from(orders).where(eq(orders.id,orderId));
  if (!stored && resource.custom_id?.startsWith("KICKBACK:")) {
    const [,merchantId,requestId] = resource.custom_id.split(":");
    if (!/^[0-9a-f-]{36}$/i.test(merchantId ?? "") || !/^[0-9a-f-]{36}$/i.test(requestId ?? "")) return;
    const merchant = await merchantById(merchantId);
    if (!merchant) return;
    const ctx = await connectionContext(merchant.id);
    const order = await ctx.client.request<CaptureOrder>(`/v2/checkout/orders/${orderId}`,{ merchantId: ctx.assertionMerchantId, priority: "high",deadline });
    fetchedOrder = order;
    const unit = order.purchase_units?.[0];
    if (unit?.custom_id !== resource.custom_id || unit.payee?.merchant_id !== ctx.connection.merchantIdInPayPal) return;
    const capture = unit.payments?.captures?.[0]; if (!capture) throw new Error("Capture not yet readable");
    const [row] = await getDb().insert(orders).values({ id: orderId,merchantId,requestId,wallet: order.payment_source?.venmo ? "VENMO" : "PAYPAL",amountCents: parseCents(capture.amount.value),status: order.status }).onConflictDoNothing().returning();
    stored = row ?? (await getDb().select().from(orders).where(eq(orders.id,orderId)))[0];
  }
  if (!stored) return;
  const merchant = await merchantById(stored.merchantId);
  if (!merchant) return;
  const ctx = await connectionContext(merchant.id);
  const order = fetchedOrder ?? await ctx.client.request<CaptureOrder>(`/v2/checkout/orders/${orderId}`,{ merchantId: ctx.assertionMerchantId, priority: "high",deadline });
  const result = await recordCapture({ merchant,order,source: "WEBHOOK" });
  if (eventType.endsWith("PENDING") && result.captureStatus !== "COMPLETED") await markCaptureStatus(merchant,result.captureId,"PENDING");
  return result;
}
async function resolveCapture(id: string, deadline: number) {
  const existing = await knownCapture(id);
  if (existing) return existing;
  const { getPayPalClient } = await import("../paypal/client");
  try {
    const capture = await getPayPalClient().request<Resource>(`/v2/payments/captures/${id}`,{ priority: "high",deadline });
    const orderId = capture.supplementary_data?.related_ids?.order_id;
    if (orderId) await recordUnknown(orderId,capture,"PAYMENT.CAPTURE.COMPLETED",deadline);
  } catch (error) { if (!(error instanceof PayPalApiError) || ![403,404].includes(error.status)) throw error; }
  return knownCapture(id);
}
async function disputeEvent(merchant: Merchant, captureId: string, disputeId: string, eventType: string, resource: Resource, at: Date) {
  await getDb().transaction(async (tx) => {
    await lockMerchant(tx,merchant.id);
    const [capture] = await tx.select().from(captures).where(eq(captures.id,captureId));
    if (!capture?.customerKey) return;
    await lockCustomer(tx,merchant.id,capture.customerKey);
    const id = `${disputeId}:${captureId}`, [previous] = await tx.select().from(disputes).where(eq(disputes.id,id));
    if (previous && previous.updatedAt > at) return;
    const resolved = eventType === "CUSTOMER.DISPUTE.RESOLVED", outcome = resource.dispute_outcome?.outcome_code ?? "UNKNOWN";
    await tx.insert(disputes).values({ id,captureId,merchantId: merchant.id,customerKey: capture.customerKey,status: resolved ? "RESOLVED" : "OPEN",outcome: resolved ? outcome : null,updatedAt: at }).onConflictDoUpdate({ target: disputes.id,set: { status: resolved ? "RESOLVED" : "OPEN",outcome: resolved ? outcome : null,updatedAt: at } });
    const sellerWon = ["RESOLVED_SELLER_FAVOUR","RESOLVED_SELLER_FAVOR"].includes(outcome);
    if (resolved && sellerWon) {
      const cases = await tx.select().from(disputes).where(and(eq(disputes.merchantId,merchant.id),eq(disputes.customerKey,capture.customerKey)));
      if (cases.every((c) => c.status === "RESOLVED" && ["RESOLVED_SELLER_FAVOUR","RESOLVED_SELLER_FAVOR"].includes(c.outcome ?? ""))) {
        await tx.update(customers).set({ status: "OK",updatedAt: new Date() }).where(and(eq(customers.merchantId,merchant.id),eq(customers.key,capture.customerKey),eq(customers.status,"FROZEN")));
        await tx.update(rewards).set({ state: "SCHEDULED",settleAt: new Date(),reason: "DISPUTE_RESOLVED" }).where(and(eq(rewards.merchantId,merchant.id),eq(rewards.customerKey,capture.customerKey),eq(rewards.state,"HELD"),eq(rewards.reason,"DISPUTE")));
      }
    } else {
      await tx.update(customers).set({ status: "FROZEN",updatedAt: new Date() }).where(and(eq(customers.merchantId,merchant.id),eq(customers.key,capture.customerKey)));
      await tx.update(rewards).set({ state: "HELD",reason: "DISPUTE" }).where(and(eq(rewards.merchantId,merchant.id),eq(rewards.customerKey,capture.customerKey),eq(rewards.state,"SCHEDULED")));
      if (resolved && ["RESOLVED_BUYER_FAVOUR","RESOLVED_BUYER_FAVOR"].includes(outcome) && capture.visitId) await invalidateVisit(tx,merchant,capture.visitId);
    }
    await enqueue(tx,merchant,capture.customerKey);
    await audit(tx,merchant.id,"customer.dispute",disputeId,{ event_type: eventType,outcome: resolved ? outcome : undefined });
  });
}
export async function dispatch(event: WebhookEvent,deadline = Date.now()+20000) {
  const claimed = await getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(webhookEvents).where(and(eq(webhookEvents.eventId,event.id),isNull(webhookEvents.processedAt),lt(webhookEvents.attempts,10),or(isNull(webhookEvents.processingAt),lt(webhookEvents.processingAt,new Date(Date.now()-5*60000))))).for("update",{ skipLocked: true });
    if (!row) return false;
    await tx.update(webhookEvents).set({ processingAt: new Date(),attempts: sql`${webhookEvents.attempts}+1` }).where(eq(webhookEvents.eventId,event.id));
    return true;
  });
  if (!claimed) return { processed: false };
  try {
    const resource = event.resource as Resource | undefined, type = event.event_type;
    if (resource) {
      if (type === "CHECKOUT.ORDER.APPROVED" && resource.id) await getDb().update(orders).set({ status: "APPROVED" }).where(and(eq(orders.id,resource.id),sql`${orders.status} not in ('COMPLETED','VOIDED')`));
      else if (/^PAYMENT\.CAPTURE\.(COMPLETED|PENDING|DECLINED|DENIED)$/.test(type) && resource.id) {
        const capture = await knownCapture(resource.id), merchant = capture ? await merchantById(capture.merchantId) : undefined;
        if (merchant && capture?.customerKey) await markCaptureStatus(merchant,resource.id,type.split(".").at(-1)!);
        else if (merchant && capture) await recordUnknown(capture.orderId,resource,type,deadline);
        else if (resource.supplementary_data?.related_ids?.order_id) await recordUnknown(resource.supplementary_data.related_ids.order_id,resource,type,deadline);
      } else if (["PAYMENT.CAPTURE.REFUNDED","PAYMENT.REFUND.FAILED","PAYMENT.REFUND.PENDING"].includes(type) && resource.id) {
        let [reward] = await getDb().select().from(rewards).where(eq(rewards.refundId,resource.id));
        if (!reward && /^KICKBACK:R:[0-9a-f-]{36}$/i.test(resource.custom_id ?? "")) [reward] = await getDb().select().from(rewards).where(eq(rewards.id,resource.custom_id!.slice(11)));
        if (reward) {
          const captureId = captureLink(resource) ?? resource.supplementary_data?.related_ids?.capture_id;
          if (captureId && captureId !== reward.captureId) throw new Error("Reward webhook capture mismatch");
          const amount = resource.amount ? parseCents(resource.amount.value) : rewardNetCents(reward);
          await applyRewardRefund(reward.id,{ id: resource.id,status: type.endsWith("FAILED") ? "FAILED" : type.endsWith("PENDING") ? "PENDING" : resource.status ?? "COMPLETED",amountCents: amount });
          console.info(JSON.stringify({ event_id: event.id,reward_id: reward.id,action: "reward.refund_webhook_matched" }));
        } else if (type === "PAYMENT.CAPTURE.REFUNDED") {
          let captureId = captureLink(resource) ?? resource.supplementary_data?.related_ids?.capture_id;
          let body = resource;
          if (!captureId) {
            const configured = await getDb().select().from(connections).limit(20);
            for (const connection of configured) { try { const ctx = await connectionContext(connection.merchantId); body = await ctx.client.request<Resource>(`/v2/payments/refunds/${resource.id}`,{ merchantId: ctx.assertionMerchantId, priority: "high",deadline }); captureId = captureLink(body); if (captureId) break; } catch (error) { if (!(error instanceof PayPalApiError) || ![403,404].includes(error.status)) throw error; } }
          }
          if (!captureId || body.amount?.currency_code !== "USD") throw new Error("Refund capture link unavailable");
          const capture = await resolveCapture(captureId,deadline), merchant = capture ? await merchantById(capture.merchantId) : undefined;
          if (merchant && !await unresolvedRefund(captureId)) await foreignRefund(merchant,captureId,resource.id,parseCents(body.amount.value));
          else await getDb().insert(refundReceipts).values({ id: resource.id,captureId,amountCents: parseCents(body.amount.value),kind: "FOREIGN",status: "COMPLETED" }).onConflictDoNothing();
        }
      } else if (type === "PAYMENT.CAPTURE.REVERSED" && resource.id) {
        const capture = await resolveCapture(resource.id,deadline), merchant = capture ? await merchantById(capture.merchantId) : undefined;
        if (merchant && capture) await foreignRefund(merchant,capture.id,`reversal:${resource.id}`,capture.refundableCents || capture.amountCents,true);
      } else if (type.startsWith("CUSTOMER.DISPUTE.") && resource.id) {
        for (const transaction of resource.disputed_transactions ?? []) { if (!transaction.seller_transaction_id) continue; const capture = await resolveCapture(transaction.seller_transaction_id,deadline), merchant = capture ? await merchantById(capture.merchantId) : undefined; if (merchant) { const at = new Date(resource.update_time ?? String(event.create_time ?? new Date().toISOString())); await disputeEvent(merchant,transaction.seller_transaction_id,resource.id,type,resource,at); } }
      } else if (type === "MERCHANT.PARTNER-CONSENT.REVOKED") {
        const paypalId = resource.merchant_id ?? resource.id;
        const rows = await getDb().select().from(connections).where(eq(connections.merchantIdInPayPal,paypalId ?? ""));
        for (const connection of rows) await getDb().transaction(async (tx) => { await lockMerchant(tx,connection.merchantId); await tx.update(merchants).set({ status: "PAUSED",rewardsPaused: true }).where(eq(merchants.id,connection.merchantId)); await tx.update(connections).set({ consentStatus: "REVOKED",updatedAt: new Date() }).where(eq(connections.merchantId,connection.merchantId)); await audit(tx,connection.merchantId,"merchant.consent_revoked",connection.merchantId); });
      }
    }
    await getDb().update(webhookEvents).set({ processedAt: new Date(),processingAt: null,lastError: null }).where(eq(webhookEvents.eventId,event.id));
    return { processed: true };
  } catch (error) {
    const reason = error instanceof PayPalApiError ? error.details[0]?.issue ?? error.name : "DISPATCH_RETRY";
    await getDb().update(webhookEvents).set({ processingAt: null,lastError: reason }).where(eq(webhookEvents.eventId,event.id));
    console.error(JSON.stringify({ event_id: event.id,action: "webhook.retry",reason }));
    return { processed: false,error: reason };
  }
}
export async function reprocessWebhooks(deadline = Date.now()+45000) {
  const waiting = await getDb().select({ receipt: refundReceipts, capture: captures }).from(refundReceipts).innerJoin(captures,eq(refundReceipts.captureId,captures.id)).where(and(isNull(refundReceipts.appliedAt),eq(refundReceipts.status,"COMPLETED"),eq(refundReceipts.kind,"FOREIGN"))).limit(25);
  for (const row of waiting) { if (Date.now() > deadline-5000) break; const merchant = await merchantById(row.capture.merchantId); if (merchant && !await unresolvedRefund(row.capture.id)) await foreignRefund(merchant,row.capture.id,row.receipt.id,row.receipt.amountCents); }
  const rows = await getDb().select().from(webhookEvents).where(and(isNull(webhookEvents.processedAt),lt(webhookEvents.attempts,10))).limit(25);
  let processed = 0;
  for (const row of rows) {
    if (Date.now() > deadline-5000) break;
    const [raw] = await getDb().select().from(rawEvents).where(sql`${rawEvents.payload}->>'id' = ${row.eventId}`).limit(1);
    if (!raw) { await getDb().update(webhookEvents).set({ lastError: "RAW_EVENT_EXPIRED",attempts: 10 }).where(eq(webhookEvents.eventId,row.eventId)); continue; }
    const result = await dispatch(raw.payload as WebhookEvent,deadline); if (result.processed) processed++;
  }
  return processed;
}
export async function settleAfterDispatch() {
  const deadline = Date.now()+20000;
  const rows = await getDb().select({ id: rewards.id }).from(rewards).where(and(eq(rewards.state,"SCHEDULED"),sql`${rewards.settleAt} <= now()`)).limit(5);
  for (const row of rows) { if (Date.now() > deadline-5000) break; await settleReward(row.id,{ deadline }); }
}
