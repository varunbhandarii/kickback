import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, type Tx } from "@/db";
import {
  captures,
  connections,
  customers,
  merchants,
  orders,
  visits,
} from "@/db/schema";
import { customerKey } from "../crypto/tenant";
import type { Merchant } from "../merchants";
import { awakenDeferred, enqueue } from "../rewards/enqueue";
import { lockCustomer, lockMerchant } from "./locks";

export type CaptureOrder = {
  id: string;
  status: string;
  payer?: { payer_id?: string };
  payment_source?: {
    paypal?: { account_id?: string };
    venmo?: { account_id?: string; user_name?: string };
  };
  purchase_units?: {
    payee?: { merchant_id?: string };
    custom_id?: string;
    payments?: {
      captures?: {
        id: string;
        status: string;
        create_time?: string;
        amount: { value: string; currency_code: string };
        seller_receivable_breakdown?: { paypal_fee?: { value: string } };
      }[];
    };
  }[];
};
export function parseCents(value: string) {
  if (!/^\d+\.\d{2}$/.test(value)) throw new Error("Invalid USD amount");
  const [whole, fraction] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(cents) || cents > 100_000_000)
    throw new Error("Amount out of range");
  return cents;
}
const rank: Record<string, number> = {
  PENDING: 0,
  COMPLETED: 1,
  PARTIALLY_REFUNDED: 2,
  REFUNDED: 3,
  DECLINED: 4,
  DENIED: 4,
  REVERSED: 5,
};
export function nextCaptureStatus(previous: string, incoming: string) {
  return (rank[incoming] ?? -1) >= (rank[previous] ?? -1) ? incoming : previous;
}
export async function recomputeVisit(tx: Tx, visitId: string) {
  const [visit] = await tx.select().from(visits).where(eq(visits.id, visitId));
  if (!visit) throw new Error("Visit missing");
  const rows = await tx
    .select()
    .from(captures)
    .where(eq(captures.visitId, visitId));
  const viable = rows.filter(
    (r) =>
      !["DECLINED", "DENIED", "REVERSED"].includes(r.status) &&
      !(r.status === "REFUNDED" && r.foreignRefundedCents >= r.amountCents),
  );
  const status =
    visit.status === "VOID" || !viable.length
      ? "VOID"
      : viable.some((r) => r.status === "PENDING")
        ? "PENDING"
        : "COMPLETED";
  const amountCents = viable.reduce(
    (sum, r) => sum + Math.max(0, r.amountCents - r.foreignRefundedCents),
    0,
  );
  const [updated] = await tx
    .update(visits)
    .set({ status, amountCents })
    .where(eq(visits.id, visitId))
    .returning();
  return updated;
}
export async function recordCapture({
  merchant,
  order,
  source,
  demoVisitAt,
  orderRead = false,
}: {
  merchant: Merchant;
  order: CaptureOrder;
  source: "PAY_PAGE" | "WEBHOOK" | "REPLAY" | "BACKFILL";
  demoVisitAt?: Date;
  orderRead?: boolean;
}) {
  if (
    demoVisitAt &&
    (process.env.KICKBACK_ENV !== "sandbox" ||
      process.env.DEMO_MODE !== "true" ||
      source !== "REPLAY")
  )
    throw new Error("Historical demo clock is sandbox replay only");
  const unit = order.purchase_units?.[0],
    capture = unit?.payments?.captures?.[0];
  if (!capture || capture.amount.currency_code !== "USD")
    throw new Error("USD capture required");
  const amountCents = parseCents(capture.amount.value),
    feeCents = capture.seller_receivable_breakdown?.paypal_fee
      ? parseCents(capture.seller_receivable_breakdown.paypal_fee.value)
      : 0;
  let wallet: "VENMO" | "PAYPAL" = order.payment_source?.venmo
    ? "VENMO"
    : "PAYPAL";
  const accountId =
    order.payment_source?.[wallet === "VENMO" ? "venmo" : "paypal"]
      ?.account_id ?? order.payer?.payer_id;
  let key = accountId ? customerKey(merchant.id, accountId) : null;
  const capturedAt = capture.create_time
    ? new Date(capture.create_time)
    : new Date();
  if (!Number.isFinite(capturedAt.getTime()))
    throw new Error("Invalid capture time");
  return getDb().transaction(async (tx) => {
    await lockMerchant(tx, merchant.id);
    const [business] = await tx
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchant.id));
    if (!business || business.purgeAfter || business.status === "DISCONNECTED")
      throw new Error("Merchant connection unavailable");
    if (key) await lockCustomer(tx, merchant.id, key);
    const [storedOrder] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, order.id));
    if (!storedOrder || storedOrder.merchantId !== merchant.id)
      throw new Error("Order is not owned by this merchant");
    if (storedOrder.amountCents !== amountCents)
      throw new Error("Capture amount does not match the purchase");
    const visitAt =
      demoVisitAt ??
      (process.env.KICKBACK_ENV === "sandbox" &&
      process.env.DEMO_MODE === "true"
        ? storedOrder.demoVisitAt
        : null) ??
      capturedAt;
    const [connection] = await tx
      .select()
      .from(connections)
      .where(eq(connections.merchantId, merchant.id));
    if (
      unit?.payee?.merchant_id &&
      unit.payee.merchant_id !== connection?.merchantIdInPayPal
    )
      throw new Error("Payee mismatch");
    await tx
      .update(orders)
      .set({ status: order.status })
      .where(eq(orders.id, order.id));
    const [existing] = await tx
      .select()
      .from(captures)
      .where(eq(captures.id, capture.id))
      .for("update");
    if (
      existing &&
      (existing.orderId !== order.id ||
        existing.merchantId !== merchant.id ||
        (existing.customerKey !== null &&
          key !== null &&
          existing.customerKey !== key) ||
        existing.amountCents !== amountCents)
    )
      throw new Error("Capture context mismatch");
    if (!key && existing?.customerKey) {
      key = existing.customerKey;
      await lockCustomer(tx, merchant.id, key);
    }
    // GET order may normalize a Venmo-funded order to PayPal. Preserve the
    // recorded source, or use the wallet reserved by our checkout session.
    if (orderRead)
      wallet = existing?.customerKey
        ? existing.wallet
        : order.payment_source?.venmo
          ? "VENMO"
          : storedOrder.wallet;
    else if (
      !order.payment_source?.paypal &&
      !order.payment_source?.venmo &&
      existing
    )
      wallet = existing.wallet;
    if (key) {
      await tx
        .insert(customers)
        .values({
          merchantId: merchant.id,
          key,
          wallets: [wallet],
          firstSeen: visitAt,
          lastSeen: visitAt,
        })
        .onConflictDoNothing();
      const [customer] = await tx
        .select()
        .from(customers)
        .where(
          and(eq(customers.merchantId, merchant.id), eq(customers.key, key)),
        );
      await tx
        .update(customers)
        .set({
          wallets: [...new Set([...customer.wallets, wallet])],
          firstSeen: new Date(
            Math.min(customer.firstSeen.getTime(), visitAt.getTime()),
          ),
          lastSeen: new Date(
            Math.max(customer.lastSeen.getTime(), visitAt.getTime()),
          ),
          updatedAt: new Date(),
        })
        .where(
          and(eq(customers.merchantId, merchant.id), eq(customers.key, key)),
        );
    }
    let visitId = existing?.visitId;
    if (!visitId && key) {
      const cutoff = new Date(
        visitAt.getTime() - merchant.spec.mergeWindowMin * 60000,
      );
      const [latest] = await tx
        .select()
        .from(visits)
        .where(
          and(
            eq(visits.merchantId, merchant.id),
            eq(visits.customerKey, key),
            inArray(visits.status, ["COMPLETED", "PENDING"]),
            gte(visits.lastCaptureAt, cutoff),
            lte(
              visits.startedAt,
              new Date(
                visitAt.getTime() + merchant.spec.mergeWindowMin * 60000,
              ),
            ),
          ),
        )
        .orderBy(desc(visits.lastCaptureAt))
        .limit(1)
        .for("update");
      if (latest) {
        visitId = latest.id;
        await tx
          .update(visits)
          .set({
            startedAt: new Date(
              Math.min(latest.startedAt.getTime(), visitAt.getTime()),
            ),
            lastCaptureAt: new Date(
              Math.max(latest.lastCaptureAt.getTime(), visitAt.getTime()),
            ),
          })
          .where(eq(visits.id, latest.id));
      } else {
        const [visit] = await tx
          .insert(visits)
          .values({
            merchantId: merchant.id,
            customerKey: key,
            startedAt: visitAt,
            lastCaptureAt: visitAt,
            amountCents: 0,
            status: capture.status === "PENDING" ? "PENDING" : "COMPLETED",
            source,
          })
          .returning();
        visitId = visit.id;
      }
    }
    const status = existing
      ? nextCaptureStatus(existing.status, capture.status)
      : capture.status;
    if (!existing)
      await tx.insert(captures).values({
        id: capture.id,
        merchantId: merchant.id,
        orderId: order.id,
        visitId,
        customerKey: key,
        wallet,
        amountCents,
        feeCents,
        refundableCents: status === "REFUNDED" ? 0 : amountCents,
        status,
        capturedAt,
      });
    else
      await tx
        .update(captures)
        .set({
          status,
          customerKey: key,
          visitId,
          wallet,
          feeCents: feeCents || existing.feeCents,
          updatedAt: new Date(),
        })
        .where(eq(captures.id, capture.id));
    await (
      await import("./clawback")
    ).reconcilePendingRefunds(tx, merchant, capture.id);
    const [current] = await tx
      .select({ status: captures.status })
      .from(captures)
      .where(eq(captures.id, capture.id));
    if (!key || !visitId)
      return {
        recognized: false as const,
        captureId: capture.id,
        captureStatus: current.status,
        wallet,
      };
    const visit = await recomputeVisit(tx, visitId);
    if (status === "COMPLETED" && existing?.status !== "COMPLETED")
      await awakenDeferred(tx, merchant.id, key, capture.id);
    const evaluation = await enqueue(tx, merchant, key);
    const reward =
      evaluation.rewards.find((r) => r.visitId === visit.id) ??
      (evaluation.latestReward?.visitId === visit.id
        ? evaluation.latestReward
        : undefined);
    return {
      recognized: true as const,
      customerKey: key,
      visit,
      captureId: capture.id,
      captureStatus: current.status,
      wallet,
      progress: evaluation.progress,
      reward,
      rewardIds: evaluation.rewards
        .filter((r) => r.state === "SCHEDULED")
        .map((r) => r.id),
    };
  });
}
export async function markCaptureStatus(
  merchant: Merchant,
  captureId: string,
  incoming: string,
) {
  return getDb().transaction(async (tx) => {
    await lockMerchant(tx, merchant.id);
    const [capture] = await tx
      .select()
      .from(captures)
      .where(
        and(eq(captures.id, captureId), eq(captures.merchantId, merchant.id)),
      );
    if (!capture) return undefined;
    if (capture.customerKey)
      await lockCustomer(tx, merchant.id, capture.customerKey);
    await tx
      .update(captures)
      .set({
        status: nextCaptureStatus(capture.status, incoming),
        updatedAt: new Date(),
      })
      .where(eq(captures.id, captureId));
    if (!capture.customerKey || !capture.visitId) return undefined;
    await (
      await import("./clawback")
    ).reconcilePendingRefunds(tx, merchant, capture.id);
    await recomputeVisit(tx, capture.visitId);
    if (incoming === "COMPLETED" && capture.status === "PENDING")
      await awakenDeferred(tx, merchant.id, capture.customerKey, captureId);
    return enqueue(tx, merchant, capture.customerKey);
  });
}
