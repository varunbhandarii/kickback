import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  customers,
  guardFlags,
  merchants,
  merchantUsers,
  rewards,
} from "@/db/schema";
import { audit } from "../audit";
import { lockCustomer, lockMerchant } from "../ledger/locks";
import { addClawbackOffset } from "../ledger/clawback";
export async function decideReview(
  merchantId: string,
  rewardId: string,
  decision: "APPROVED" | "DECLINED",
  userId?: string,
) {
  return getDb().transaction(async (tx) => {
    if (userId) {
      const [owner] = await tx
        .select()
        .from(merchantUsers)
        .where(
          and(
            eq(merchantUsers.merchantId, merchantId),
            eq(merchantUsers.userId, userId),
            eq(merchantUsers.role, "OWNER"),
          ),
        );
      if (!owner) throw new Error("NOT_AUTHORIZED");
    }
    await lockMerchant(tx, merchantId);
    const [flag] = await tx
      .select()
      .from(guardFlags)
      .where(
        and(
          eq(guardFlags.merchantId, merchantId),
          eq(guardFlags.rewardId, rewardId),
        ),
      )
      .for("update");
    const [reward] = await tx
      .select()
      .from(rewards)
      .where(and(eq(rewards.merchantId, merchantId), eq(rewards.id, rewardId)))
      .for("update");
    if (!flag || !reward) throw new Error("REVIEW_NOT_FOUND");
    if (flag.decision !== "PENDING")
      return { changed: false, decision: flag.decision };
    if (
      reward.state !== "HELD" ||
      reward.reason !== "REVIEW" ||
      reward.sendUncertain
    )
      throw new Error("REVIEW_NOT_PENDING");
    await lockCustomer(tx, merchantId, reward.customerKey);
    const [person] = await tx
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.merchantId, merchantId),
            eq(customers.key, reward.customerKey),
          ),
        ),
      [merchant] = await tx
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId));
    if (
      decision === "APPROVED" &&
      (person?.status !== "OK" ||
        merchant.status !== "ACTIVE" ||
        merchant.rewardsPaused ||
        merchant.purgeAfter)
    )
      throw new Error("REWARD_NOT_ELIGIBLE");
    await tx
      .update(guardFlags)
      .set({ decision, decidedBy: userId ?? null, decidedAt: new Date() })
      .where(eq(guardFlags.id, flag.id));
    if (decision === "DECLINED")
      await addClawbackOffset(tx, reward, reward.offsetAppliedCents);
    await tx
      .update(rewards)
      .set(
        decision === "APPROVED"
          ? {
              state: "SCHEDULED",
              tier: "INSTANT",
              reason: "REVIEW_APPROVED",
              settleAt: new Date(),
            }
          : { state: "CANCELLED", reason: "DECLINED" },
      )
      .where(eq(rewards.id, rewardId));
    await audit(
      tx,
      merchantId,
      "guard." + decision.toLowerCase(),
      rewardId,
      { score: flag.score },
      userId ?? "operator",
    );
    return { changed: true, decision };
  });
}
