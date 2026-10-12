import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { captures, customers, rewards, visits, webhookEvents } from "@/db/schema";
import { loadMerchant } from "@/lib/merchants";
import { validBearer } from "@/lib/http";
import { sandboxToolsEnabled } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!sandboxToolsEnabled()) return Response.json({ error: "Not found" },{ status: 404 });
  if (!validBearer(request)) return Response.json({ error: "Unauthorized" },{ status: 401 });
  const merchant = await loadMerchant(new URL(request.url).searchParams.get("merchant") ?? "rosas",true); if (!merchant) return Response.json({ error: "Not found" },{ status: 404 });
  const [counts] = await getDb().select({ visits: sql<number>`count(*)::int` }).from(visits).where(eq(visits.merchantId,merchant.id));
  const customerRows = await getDb().select({ progress: customers.progress,status: customers.status,wallets: customers.wallets }).from(customers).where(eq(customers.merchantId,merchant.id)).limit(20);
  const rewardRows = await getDb().select({ id: rewards.id,state: rewards.state,amountCents: rewards.amountCents,offsetAppliedCents: rewards.offsetAppliedCents,refundId: rewards.refundId,captureId: rewards.captureId,requestId: rewards.requestId,attempts: rewards.attempts,reason: rewards.reason,sendUncertain: rewards.sendUncertain }).from(rewards).where(eq(rewards.merchantId,merchant.id)).orderBy(desc(rewards.createdAt)).limit(40);
  const captureRows = await getDb().select({ id: captures.id,orderId: captures.orderId,status: captures.status,wallet: captures.wallet,amountCents: captures.amountCents,refundableCents: captures.refundableCents,foreignRefundedCents: captures.foreignRefundedCents }).from(captures).where(eq(captures.merchantId,merchant.id)).orderBy(desc(captures.capturedAt)).limit(40);
  const [pending] = await getDb().select({ count: sql<number>`count(*)::int` }).from(webhookEvents).where(and(sql`${webhookEvents.processedAt} is null`,sql`${webhookEvents.attempts} < 10`));
  return Response.json({ merchant: merchant.slug,status: merchant.status,rewardsPaused: merchant.rewardsPaused,counts,customers: customerRows,rewards: rewardRows,captures: captureRows,pendingWebhooks: pending.count },{ headers: { "Cache-Control": "no-store" } });
}
