import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLog,
  backfillRuns,
  captures,
  connections,
  customers,
  historyEvents,
  merchantUsers,
  merchants,
  offsets,
  orders,
  rawEvents,
  refundReceipts,
  rewards,
  settings,
  user,
  visits,
  webhookEvents,
} from "@/db/schema";
import {
  fixture,
  milestone,
  purchase,
  resetDb,
  setupDb,
  teardownDb,
} from "./helpers/db";
import {
  disconnectMerchant,
  setRewardsPaused,
  setStaff,
} from "@/lib/merchant-actions";
import { purgeOperationalMetadata, purgeTenants } from "@/lib/db/purge-tenants";
import { dispatch } from "@/lib/webhooks/dispatch";
async function owned() {
  const merchant = await fixture(),
    id = randomUUID();
  await getDb()
    .insert(user)
    .values({
      id,
      name: "Owner",
      email: `${id}@example.com`,
      updatedAt: new Date(),
    });
  await getDb()
    .insert(merchantUsers)
    .values({ userId: id, merchantId: merchant.id });
  return { merchant, id };
}
beforeAll(setupDb);
beforeEach(resetDb);
afterAll(teardownDb);
describe("disconnect and tenant retention", () => {
  it("preserves staff exclusion through a dispute and restores the risk freeze when unmarked", async () => {
    const { merchant, id } = await owned(),
      earned = await milestone(merchant);
    await setStaff(id, merchant.id, earned.reward.customerKey, true);
    const event = {
      id: "WH-STAFF-DISPUTE",
      event_type: "CUSTOMER.DISPUTE.CREATED",
      resource: {
        dispute_id: "CASE-STAFF",
        disputed_transactions: [
          { seller_transaction_id: earned.reward.captureId! },
        ],
      },
    };
    await getDb()
      .insert(webhookEvents)
      .values({ eventId: event.id, eventType: event.event_type });
    expect((await dispatch(event)).processed).toBe(true);
    expect((await getDb().select().from(customers))[0].status).toBe("EXCLUDED");
    await setStaff(id, merchant.id, earned.reward.customerKey, false);
    expect((await getDb().select().from(customers))[0].status).toBe("FROZEN");
  });
  it("checks ownership, pauses checkout and rewards, cancels queued work and connection attempts", async () => {
    const { merchant, id } = await owned();
    await milestone(merchant);
    await getDb()
      .insert(settings)
      .values({
        key: `connection:${merchant.id}:attempt`,
        value: { token: "obsolete" },
      });
    await expect(
      disconnectMerchant("wrong-owner", merchant.id),
    ).rejects.toThrow(/access denied/);
    await disconnectMerchant(id, merchant.id);
    const [business] = await getDb().select().from(merchants),
      [connection] = await getDb().select().from(connections),
      [reward] = await getDb().select().from(rewards);
    expect(business.status).toBe("PAUSED");
    expect(business.rewardsPaused).toBe(true);
    expect(+business.purgeAfter!).toBeGreaterThan(Date.now() + 47 * 3600000);
    expect(connection.status).toBe("DISCONNECTED");
    expect(reward.state).toBe("CANCELLED");
    expect(reward.reason).toBe("DISCONNECTED");
    expect(await getDb().select().from(settings)).toHaveLength(0);
    await expect(setRewardsPaused(id, merchant.id, false)).rejects.toThrow(
      /Reconnect/,
    );
  });
  it("purges all tenant ledger data and seals no credentials in surviving rows", async () => {
    const { merchant, id } = await owned(),
      other = await fixture(undefined, "other-cafe");
    await milestone(merchant);
    await purchase(other);
    await getDb().insert(refundReceipts).values({
      id: "ORPHAN",
      merchantId: merchant.id,
      captureId: "UNSEEN",
      amountCents: 100,
      kind: "FOREIGN",
      status: "COMPLETED",
    });
    await getDb()
      .insert(rawEvents)
      .values({
        kind: "webhook",
        payload: { custom_id: merchant.id, email: "payer@example.com" },
        purgeAfter: new Date(Date.now() + 86400000),
      });
    await getDb().insert(historyEvents).values({
      merchantId: merchant.id,
      key: "opaque",
      kind: "UNRECOGNIZED",
      occurredAt: new Date(),
    });
    await getDb().insert(backfillRuns).values({
      merchantId: merchant.id,
      windowFrom: new Date(),
      windowTo: new Date(),
    });
    await getDb()
      .insert(settings)
      .values({ key: `order:${merchant.id}:x`, value: {} });
    await disconnectMerchant(id, merchant.id);
    expect(await purgeTenants()).toBe(0);
    expect(await purgeTenants(new Date(Date.now() + 49 * 3600000))).toBe(1);
    for (const table of [
      captures,
      customers,
      orders,
      visits,
      rewards,
      offsets,
      connections,
      historyEvents,
      backfillRuns,
    ])
      expect(
        (await getDb().select().from(table)).filter(
          (r) => r.merchantId === merchant.id,
        ),
      ).toHaveLength(0);
    expect(await getDb().select().from(refundReceipts)).toHaveLength(0);
    expect(await getDb().select().from(rawEvents)).toHaveLength(0);
    expect(await getDb().select().from(settings)).toHaveLength(0);
    const [retained] = await getDb()
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchant.id));
    expect(retained.status).toBe("DISCONNECTED");
    expect(retained.stats).toEqual({});
    expect(
      (
        await getDb()
          .select()
          .from(auditLog)
          .where(eq(auditLog.merchantId, merchant.id))
      ).every(
        (r) =>
          r.subject === "tenant" &&
          JSON.stringify(r.details) === "{}" &&
          r.actor === "system",
      ),
    ).toBe(true);
    expect(
      await getDb()
        .select()
        .from(captures)
        .where(eq(captures.merchantId, other.id)),
    ).toHaveLength(1);
  });
  it("treats a signed consent-revocation receipt like disconnect", async () => {
    const { merchant } = await owned();
    const event = {
      id: "WH-REVOKED",
      event_type: "MERCHANT.PARTNER-CONSENT.REVOKED",
      resource: { merchant_id: "MERCHANT12345" },
    };
    await getDb()
      .insert(webhookEvents)
      .values({ eventId: event.id, eventType: event.event_type });
    expect((await dispatch(event)).processed).toBe(true);
    const [business] = await getDb()
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchant.id));
    expect(business.purgeAfter).not.toBeNull();
    expect((await getDb().select().from(connections))[0].status).toBe(
      "REVOKED",
    );
  });
  it("expires only old order fingerprints and old audits", async () => {
    const now = new Date();
    await getDb()
      .insert(settings)
      .values([
        {
          key: "order:expired",
          value: {},
          updatedAt: new Date(+now - 8 * 86400000),
        },
        { key: "order:current", value: {} },
        { key: "rewards_paused", value: true, updatedAt: new Date(0) },
      ]);
    await getDb()
      .insert(auditLog)
      .values({
        action: "old",
        subject: "old",
        actor: "system",
        at: new Date(+now - 91 * 86400000),
      });
    expect(await purgeOperationalMetadata(now)).toEqual({
      orderKeys: 1,
      audits: 1,
    });
    expect((await getDb().select().from(settings)).map((r) => r.key)).toEqual([
      "order:current",
      "rewards_paused",
    ]);
  });
  it("staff exclusion cancels queued rewards and future milestones", async () => {
    const { merchant, id } = await owned(),
      earned = await milestone(merchant);
    await setStaff(id, merchant.id, earned.reward.customerKey, true);
    expect((await getDb().select().from(rewards))[0]).toMatchObject({
      state: "CANCELLED",
      reason: "EXCLUDED",
    });
    for (let n = 0; n < 5; n++)
      await purchase(merchant, {
        at: new Date(Date.now() + n * 86400000),
        account: "PRIVATE_BUYER_ID",
      });
    expect(
      (await getDb().select().from(rewards)).every(
        (r) => r.state === "CANCELLED",
      ),
    ).toBe(true);
    await setStaff(id, merchant.id, earned.reward.customerKey, false);
    expect((await getDb().select().from(customers))[0].status).toBe("OK");
  });
});
