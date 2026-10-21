import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, type Tx } from "@/db";
import {
  backfillRuns,
  captures,
  connections,
  customers,
  disputes,
  merchants,
  programs,
  rewards,
  settings,
} from "@/db/schema";
import { assertConnectionOwner } from "./connections";
import { lockCustomer, lockMerchant } from "./ledger/locks";
import { audit } from "./audit";
import { demoTenantProtected, getEnv } from "./env";
import { forgetConnection } from "./merchants";
import { loadProgram } from "./engine/program";
import { enqueue } from "./rewards/enqueue";
export async function disconnectTx(
  tx: Tx,
  merchantId: string,
  revoked = false,
  now = new Date(),
) {
  await lockMerchant(tx, merchantId);
  const [merchant] = await tx
    .select()
    .from(merchants)
    .where(eq(merchants.id, merchantId));
  if (!merchant) return;
  const purgeAfter =
    merchant.purgeAfter ??
    new Date(+now + getEnv().TENANT_PURGE_HOURS * 3600000);
  await tx
    .update(merchants)
    .set({
      status: "PAUSED",
      rewardsPaused: true,
      purgeAfter,
      onboardingStep: "connect",
    })
    .where(eq(merchants.id, merchantId));
  await tx
    .update(connections)
    .set({
      status: revoked ? "REVOKED" : "DISCONNECTED",
      consentStatus: revoked ? "REVOKED" : "DISCONNECTED",
      updatedAt: now,
    })
    .where(eq(connections.merchantId, merchantId));
  await tx
    .update(rewards)
    .set({
      state: "CANCELLED",
      reason: "DISCONNECTED",
      lockedAt: null,
      lockedBy: null,
    })
    .where(
      and(
        eq(rewards.merchantId, merchantId),
        inArray(rewards.state, ["SCHEDULED", "HELD", "DEFERRED", "EARNED"]),
      ),
    );
  await tx
    .update(backfillRuns)
    .set({ status: "FAILED", error: "IMPORT_CANCELLED", finishedAt: now })
    .where(
      and(
        eq(backfillRuns.merchantId, merchantId),
        inArray(backfillRuns.status, ["QUEUED", "RUNNING"]),
      ),
    );
  await tx
    .delete(settings)
    .where(eq(settings.key, `connection:${merchantId}:attempt`));
  forgetConnection(merchantId);
  await audit(
    tx,
    merchantId,
    revoked ? "merchant.consent_revoked" : "merchant.disconnected",
    merchantId,
    { purgeAfter: purgeAfter.toISOString() },
  );
  return purgeAfter;
}
export class ProtectedDemoTenant extends Error {}
export async function disconnectMerchant(userId: string, merchantId: string) {
  return getDb().transaction(async (tx) => {
    await assertConnectionOwner(tx, userId, merchantId);
    const [merchant] = await tx
      .select({ slug: merchants.slug })
      .from(merchants)
      .where(eq(merchants.id, merchantId));
    // A disconnect starts the purge clock; the shared demo shops must survive it.
    if (merchant && demoTenantProtected(merchant.slug))
      throw new ProtectedDemoTenant("PROTECTED_DEMO_TENANT");
    return disconnectTx(tx, merchantId);
  });
}
export async function setRewardsPaused(
  userId: string,
  merchantId: string,
  paused: boolean,
) {
  await getDb().transaction(async (tx) => {
    await assertConnectionOwner(tx, userId, merchantId);
    await lockMerchant(tx, merchantId);
    const [merchant] = await tx
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId)),
      [connection] = await tx
        .select()
        .from(connections)
        .where(eq(connections.merchantId, merchantId));
    if (!paused && (merchant.purgeAfter || connection?.status !== "CONNECTED"))
      throw new Error("Reconnect before resuming rewards");
    await tx
      .update(merchants)
      .set({ rewardsPaused: paused })
      .where(eq(merchants.id, merchantId));
    await audit(
      tx,
      merchantId,
      paused ? "merchant.paused" : "merchant.resumed",
      merchantId,
      {},
      userId,
    );
  });
}
export async function setStaff(
  userId: string,
  merchantId: string,
  key: string,
  excluded: boolean,
) {
  await getDb().transaction(async (tx) => {
    await assertConnectionOwner(tx, userId, merchantId);
    await lockMerchant(tx, merchantId);
    await lockCustomer(tx, merchantId, key);
    const [person] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.merchantId, merchantId), eq(customers.key, key)));
    if (!person) throw new Error("Customer not found");
    const risks = await tx
        .select()
        .from(disputes)
        .where(
          and(
            eq(disputes.merchantId, merchantId),
            eq(disputes.customerKey, key),
          ),
        ),
      reversed = await tx
        .select()
        .from(captures)
        .where(
          and(
            eq(captures.merchantId, merchantId),
            eq(captures.customerKey, key),
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
      .set({
        status: excluded ? "EXCLUDED" : frozen ? "FROZEN" : "OK",
        updatedAt: new Date(),
      })
      .where(and(eq(customers.merchantId, merchantId), eq(customers.key, key)));
    if (excluded)
      await tx
        .update(rewards)
        .set({ state: "CANCELLED", reason: "EXCLUDED" })
        .where(
          and(
            eq(rewards.merchantId, merchantId),
            eq(rewards.customerKey, key),
            inArray(rewards.state, ["SCHEDULED", "HELD", "DEFERRED"]),
          ),
        );
    const [merchant] = await tx
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId)),
      [program] = await tx
        .select()
        .from(programs)
        .where(
          and(
            eq(programs.merchantId, merchantId),
            eq(programs.status, "ACTIVE"),
          ),
        );
    if (program)
      await enqueue(
        tx,
        { ...merchant, program, spec: loadProgram(program.spec) },
        key,
      );
    await audit(
      tx,
      merchantId,
      excluded ? "customer.excluded" : "customer.included",
      key,
      {},
      userId,
    );
  });
}
export async function pendingTenantPurges() {
  return getDb()
    .select()
    .from(merchants)
    .where(isNotNull(merchants.purgeAfter));
}
