import { randomUUID } from "node:crypto";
import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import {
  captures,
  customers,
  disputes,
  historyEvents,
  orders,
  refundReceipts,
  rewards,
  visits,
} from "@/db/schema";
import type { Merchant } from "../merchants";
import { lockCustomer } from "../ledger/locks";
import { foreignRefundTx } from "../ledger/clawback";
import { recomputeVisit } from "../ledger/record-capture";
import type { HistoryItem } from "./classify";

async function applyPending(tx: Tx, merchant: Merchant, captureId: string) {
  const pending = await tx
    .select()
    .from(refundReceipts)
    .where(
      and(
        eq(refundReceipts.captureId, captureId),
        inArray(refundReceipts.kind, [
          "FOREIGN",
          "HISTORY_CHARGEBACK",
          "HISTORY_UNDO",
        ]),
        sql`${refundReceipts.appliedAt} is null`,
      ),
    )
    .orderBy(refundReceipts.receivedAt);
  for (const receipt of pending) {
    if (receipt.kind === "FOREIGN")
      await foreignRefundTx(
        tx,
        merchant,
        captureId,
        receipt.id,
        receipt.amountCents,
        false,
        false,
      );
    else {
      await applyHistoryRisk(
        tx,
        merchant,
        captureId,
        receipt.kind === "HISTORY_UNDO",
        receipt.receivedAt,
      );
      await tx
        .update(refundReceipts)
        .set({ appliedAt: new Date() })
        .where(eq(refundReceipts.id, receipt.id));
    }
  }
}
async function applyHistoryRisk(
  tx: Tx,
  merchant: Merchant,
  captureId: string,
  undo: boolean,
  at: Date,
) {
  const [capture] = await tx
    .select()
    .from(captures)
    .where(
      and(eq(captures.id, captureId), eq(captures.merchantId, merchant.id)),
    );
  if (!capture?.customerKey) return false;
  const id = `history:${captureId}`,
    [old] = await tx.select().from(disputes).where(eq(disputes.id, id));
  if (old && old.updatedAt > at) return true;
  await tx
    .insert(disputes)
    .values({
      id,
      captureId,
      merchantId: merchant.id,
      customerKey: capture.customerKey,
      status: undo ? "RESOLVED" : "OPEN",
      outcome: undo ? "RESOLVED_SELLER_FAVOR" : null,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: disputes.id,
      set: {
        status: undo ? "RESOLVED" : "OPEN",
        outcome: undo ? "RESOLVED_SELLER_FAVOR" : null,
        updatedAt: at,
      },
    });
  const risks = await tx
      .select()
      .from(disputes)
      .where(
        and(
          eq(disputes.merchantId, merchant.id),
          eq(disputes.customerKey, capture.customerKey),
        ),
      ),
    reversed = await tx
      .select()
      .from(captures)
      .where(
        and(
          eq(captures.merchantId, merchant.id),
          eq(captures.customerKey, capture.customerKey),
          eq(captures.status, "REVERSED"),
        ),
      );
  const frozen =
    reversed.length > 0 ||
    risks.some(
      (r) =>
        r.status !== "RESOLVED" ||
        !["RESOLVED_SELLER_FAVOR", "RESOLVED_SELLER_FAVOUR"].includes(
          r.outcome ?? "",
        ),
    );
  await tx
    .update(customers)
    .set({ status: frozen ? "FROZEN" : "OK" })
    .where(
      and(
        eq(customers.merchantId, merchant.id),
        eq(customers.key, capture.customerKey),
        sql`${customers.status} <> 'EXCLUDED'`,
      ),
    );
  if (frozen)
    await tx
      .update(rewards)
      .set({ state: "HELD", reason: "DISPUTE" })
      .where(
        and(
          eq(rewards.merchantId, merchant.id),
          eq(rewards.customerKey, capture.customerKey),
          eq(rewards.state, "SCHEDULED"),
        ),
      );
  else
    await tx
      .update(rewards)
      .set({
        state: "SCHEDULED",
        reason: "DISPUTE_RESOLVED",
        settleAt: new Date(),
      })
      .where(
        and(
          eq(rewards.merchantId, merchant.id),
          eq(rewards.customerKey, capture.customerKey),
          eq(rewards.state, "HELD"),
          inArray(rewards.reason, ["DISPUTE", "CUSTOMER_FROZEN"]),
        ),
      );
  return true;
}
export async function persistHistoryItem(
  tx: Tx,
  merchant: Merchant,
  item: HistoryItem,
) {
  const [seen] = await tx
    .select()
    .from(historyEvents)
    .where(
      and(
        eq(historyEvents.merchantId, merchant.id),
        eq(historyEvents.key, item.key),
      ),
    );
  if (seen) return { fresh: false, visitCreated: false };
  const [existing] = await tx
    .select()
    .from(captures)
    .where(eq(captures.id, item.id));
  const person =
    (existing?.merchantId === merchant.id ? existing.customerKey : undefined) ??
    item.customerKey;
  const kind = item.kind === "UNRECOGNIZED" && person ? "SALE" : item.kind;
  await tx.insert(historyEvents).values({
    merchantId: merchant.id,
    key: item.key,
    kind,
    customerKey: person,
    occurredAt: item.at,
  });
  if (kind === "UNRECOGNIZED") return { fresh: true, visitCreated: false };
  let visitCreated = false;
  if (kind === "SALE" && person && !existing) {
    await lockCustomer(tx, merchant.id, person);
    await tx
      .insert(customers)
      .values({
        merchantId: merchant.id,
        key: person,
        firstSeen: item.at,
        lastSeen: item.at,
        wallets: [item.wallet],
      })
      .onConflictDoNothing();
    const [customer] = await tx
      .select()
      .from(customers)
      .where(
        and(eq(customers.merchantId, merchant.id), eq(customers.key, person)),
      );
    await tx
      .update(customers)
      .set({
        firstSeen: new Date(
          Math.min(customer.firstSeen.getTime(), item.at.getTime()),
        ),
        lastSeen: new Date(
          Math.max(customer.lastSeen.getTime(), item.at.getTime()),
        ),
        wallets: [...new Set([...customer.wallets, item.wallet])],
      })
      .where(
        and(eq(customers.merchantId, merchant.id), eq(customers.key, person)),
      );
    const gap = merchant.spec.mergeWindowMin * 60000;
    const adjacent = await tx
      .select()
      .from(visits)
      .where(
        and(
          eq(visits.merchantId, merchant.id),
          eq(visits.customerKey, person),
          inArray(visits.status, ["COMPLETED", "PENDING"]),
          gte(visits.lastCaptureAt, new Date(item.at.getTime() - gap)),
          lte(visits.startedAt, new Date(item.at.getTime() + gap)),
        ),
      )
      .orderBy(visits.startedAt);
    const consumed = await tx
      .select()
      .from(rewards)
      .where(
        and(
          eq(rewards.merchantId, merchant.id),
          eq(rewards.customerKey, person),
        ),
      );
    const protectedIds = new Set(
      consumed.flatMap((r) => [r.visitId, ...r.basisVisitIds]),
    );
    // Bridge visits only when no consumed/rewarded cycle would be rewritten.
    const merge =
      adjacent.length > 1 && adjacent.some((v) => protectedIds.has(v.id))
        ? adjacent.slice(0, 1)
        : adjacent;
    let visitId = merge[0]?.id;
    if (!visitId) {
      const [visit] = await tx
        .insert(visits)
        .values({
          merchantId: merchant.id,
          customerKey: person,
          startedAt: item.at,
          lastCaptureAt: item.at,
          amountCents: 0,
          status: "COMPLETED",
          source: "BACKFILL",
        })
        .returning();
      visitId = visit.id;
      visitCreated = true;
    } else {
      await tx
        .update(visits)
        .set({
          startedAt: new Date(
            Math.min(
              item.at.getTime(),
              ...merge.map((v) => v.startedAt.getTime()),
            ),
          ),
          lastCaptureAt: new Date(
            Math.max(
              item.at.getTime(),
              ...merge.map((v) => v.lastCaptureAt.getTime()),
            ),
          ),
        })
        .where(eq(visits.id, visitId));
      for (const extra of merge.slice(1)) {
        await tx
          .update(captures)
          .set({ visitId })
          .where(eq(captures.visitId, extra.id));
        await tx.delete(visits).where(eq(visits.id, extra.id));
      }
    }
    const orderId = `bf:${item.id}`;
    await tx.insert(orders).values({
      id: orderId,
      merchantId: merchant.id,
      requestId: randomUUID(),
      wallet: item.wallet,
      amountCents: item.amount,
      status: "BACKFILL",
      createdAt: item.at,
    });
    await tx.insert(captures).values({
      id: item.id,
      merchantId: merchant.id,
      orderId,
      visitId,
      customerKey: person,
      wallet: item.wallet,
      amountCents: item.amount,
      feeCents: item.fee,
      refundableCents: item.amount,
      status: "COMPLETED",
      capturedAt: item.at,
    });
    await applyPending(tx, merchant, item.id);
    await recomputeVisit(tx, visitId);
  } else if (kind === "REFUND" && item.reference) {
    const [capture] = await tx
      .select()
      .from(captures)
      .where(eq(captures.id, item.reference));
    if (capture && capture.merchantId !== merchant.id)
      return { fresh: true, visitCreated: false };
    if (capture)
      await foreignRefundTx(
        tx,
        merchant,
        item.reference,
        item.id,
        item.amount,
        false,
        false,
      );
    else
      await tx
        .insert(refundReceipts)
        .values({
          id: item.id,
          merchantId: merchant.id,
          captureId: item.reference,
          amountCents: item.amount,
          kind: "FOREIGN",
          status: "COMPLETED",
        })
        .onConflictDoNothing();
  } else if ((kind === "CHARGEBACK" || kind === "UNDO") && item.reference) {
    const applied = await applyHistoryRisk(
      tx,
      merchant,
      item.reference,
      kind === "UNDO",
      item.at,
    );
    await tx
      .insert(refundReceipts)
      .values({
        id: `risk:${item.key}`,
        merchantId: merchant.id,
        captureId: item.reference,
        amountCents: item.amount,
        kind: kind === "UNDO" ? "HISTORY_UNDO" : "HISTORY_CHARGEBACK",
        status: "COMPLETED",
        receivedAt: item.at,
        appliedAt: applied ? new Date() : null,
      })
      .onConflictDoNothing();
  }
  return { fresh: true, visitCreated };
}
