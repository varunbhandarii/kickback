import { progressLink } from "./progress-link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { captures, customers, orders, rewards } from "@/db/schema";
import type { verifyOrderToken } from "../crypto/order-token";
import { connectionContext, loadMerchant } from "../merchants";
import { PayPalApiError } from "../paypal/client";
import { PaymentInputError } from "./create";
import { recordCapture, type CaptureOrder } from "../ledger/record-capture";
import { signRewardToken } from "../crypto/reward-token";
import { rewardNetCents } from "../rewards/enqueue";
import type { Progress } from "../engine/evaluate";
export function publicReward(row: typeof rewards.$inferSelect | undefined) {
  return row
    ? {
        id: row.id,
        amountCents: rewardNetCents(row),
        kind: row.kind,
        state: row.state,
        token: signRewardToken(row.id),
      }
    : undefined;
}
export async function capturePayment(
  context: ReturnType<typeof verifyOrderToken>,
) {
  const merchant = context.slug ? await loadMerchant(context.slug) : undefined;
  if (!merchant || merchant.id !== context.merchant)
    throw new PaymentInputError("Order merchant mismatch", 400);
  if (merchant.status !== "ACTIVE" || merchant.purgeAfter)
    throw new PaymentInputError("Payments are paused", 409);
  const [stored] = await getDb()
    .select()
    .from(orders)
    .where(eq(orders.id, context.orderId));
  if (
    !stored ||
    stored.merchantId !== merchant.id ||
    stored.requestId !== context.requestId ||
    stored.amountCents !== context.amountCents ||
    stored.wallet.toLowerCase() !== context.wallet
  )
    throw new PaymentInputError("Order context mismatch", 400);
  const [known] = await getDb()
    .select()
    .from(captures)
    .where(eq(captures.orderId, stored.id));
  if (known && known.status !== "PENDING") {
    const [customer] = known.customerKey
      ? await getDb()
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.merchantId, merchant.id),
              eq(customers.key, known.customerKey),
            ),
          )
      : [];
    const [reward] = known.visitId
      ? await getDb()
          .select()
          .from(rewards)
          .where(eq(rewards.visitId, known.visitId))
      : [];
    return {
      captureStatus: known.status,
      captureId: known.id,
      amountCents: stored.amountCents,
      wallet: stored.wallet,
      recognized: Boolean(customer),
      progressUrl: progressLink(
        merchant,
        customer ? known.customerKey : undefined,
      ),
      progress: customer?.progress as Progress | undefined,
      reward: publicReward(reward),
      rewardIds: reward?.state === "SCHEDULED" ? [reward.id] : [],
    };
  }
  const ctx = await connectionContext(merchant.id);
  let order: CaptureOrder | undefined,
    orderRead = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      order = await ctx.client.request<CaptureOrder>(
        `/v2/checkout/orders/${stored.id}/capture`,
        {
          method: "POST",
          merchantId: ctx.assertionMerchantId,
          requestId: stored.requestId,
          priority: "high",
        },
      );
      break;
    } catch (error) {
      if (!(error instanceof PayPalApiError)) throw error;
      const issue = error.details[0]?.issue;
      if (issue === "ORDER_ALREADY_CAPTURED") {
        order = await ctx.client.request<CaptureOrder>(
          `/v2/checkout/orders/${stored.id}`,
          { merchantId: ctx.assertionMerchantId, priority: "high" },
        );
        orderRead = true;
        break;
      }
      if (
        (issue === "ORDER_COMPLETION_IN_PROGRESS" || error.status === 409) &&
        attempt < 3
      ) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw error;
    }
  }
  if (!order) throw new Error("Capture unavailable");
  const result = await recordCapture({
    merchant,
    order,
    source: "PAY_PAGE",
    orderRead,
  });
  return {
    captureStatus: result.captureStatus,
    captureId: result.captureId,
    amountCents: stored.amountCents,
    wallet: stored.wallet,
    recognized: result.recognized,
    progressUrl: progressLink(
      merchant,
      result.recognized ? result.customerKey : undefined,
    ),
    progress: result.recognized ? result.progress : undefined,
    reward: publicReward(result.recognized ? result.reward : undefined),
    rewardIds: result.recognized ? result.rewardIds : [],
  };
}
