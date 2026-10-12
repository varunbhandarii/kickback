import { randomUUID } from "node:crypto";
import { getEnv } from "../env";
import { createPayment } from "./create";
import { parseCents, recordCapture, type CaptureOrder } from "../ledger/record-capture";
import { settleReward } from "../rewards/executor";
export async function replay({ slug,count,amount,vaultId,historical = false,deadline = Date.now()+45000 }: { slug: string; count: number; amount: string; vaultId: string; historical?: boolean; deadline?: number }) {
  if (getEnv().KICKBACK_ENV !== "sandbox" || !getEnv().DEMO_MODE) throw new Error("Replay requires sandbox demo mode");
  if (!Number.isInteger(count) || count < 1 || count > 20 || !vaultId) throw new Error("Choose 1–20 purchases and a saved sandbox wallet");
  const results: Record<string,unknown>[] = [];
  for (let n = 0; n < count; n++) {
    if (Date.now() > deadline-8000) throw new Error("Replay deadline reached; completed purchases remain recorded");
    const demoVisitAt = historical ? new Date(Date.now()-(count-n)*86400000) : undefined;
    const { merchant,ctx,order } = await createPayment({ slug,wallet: "paypal",amountCents: parseCents(amount),requestId: randomUUID() },vaultId,demoVisitAt);
    const captured = order.purchase_units?.[0]?.payments?.captures?.length ? order : await ctx.client.request<CaptureOrder>(`/v2/checkout/orders/${order.id}/capture`,{ method: "POST",merchantId: ctx.assertionMerchantId,requestId: randomUUID(),priority: "low",deadline });
    const result = await recordCapture({ merchant,order: captured,source: "REPLAY",demoVisitAt });
    if (result.recognized && getEnv().REWARD_SETTLE_IMMEDIATE) for (const id of result.rewardIds) await settleReward(id,{ deadline });
    results.push({ orderId: order.id,captureId: result.captureId,captureStatus: result.captureStatus,recognized: result.recognized,progress: result.recognized ? result.progress : null,rewardId: result.recognized ? result.reward?.id : null,historicalVisitFixture: historical });
  }
  return results;
}
