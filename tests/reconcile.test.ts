import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  captures,
  connections,
  customers,
  disputes,
  offsets,
  refundReceipts,
  rewards,
} from "@/db/schema";
import {
  fixture,
  milestone,
  purchase,
  resetDb,
  setupDb,
  teardownDb,
} from "./helpers/db";
import { defaultProgram } from "@/lib/engine/program";
import { applyRewardRefund } from "@/lib/ledger/clawback";
import { SEARCH_SCOPE } from "@/lib/connections";
import { startBackfill, runBackfill } from "@/lib/history/worker";
import type { SearchRow } from "@/lib/history/classify";
function row(
  id: string,
  code = "T0000",
  reference?: string,
  value = "5.50",
  at = new Date(Date.now() - 3600000),
): SearchRow {
  return {
    transaction_info: {
      transaction_id: id,
      transaction_event_code: code,
      transaction_status: "S",
      transaction_initiation_date: at.toISOString(),
      transaction_amount: { value, currency_code: "USD" },
      paypal_reference_id: reference,
      paypal_reference_id_type: reference ? "TXN" : undefined,
    },
    payer_info: { account_id: "PRIVATE_BUYER_ID" },
  };
}
async function reconcile(merchantId: string, rows: SearchRow[]) {
  await getDb()
    .update(connections)
    .set({ scopes: [SEARCH_SCOPE] })
    .where(eq(connections.merchantId, merchantId));
  const run = await startBackfill(merchantId, undefined, "RECONCILE");
  expect(
    (
      await runBackfill(run.id, Date.now() + 45000, {
        request: async <T>() =>
          ({ transaction_details: rows, total_pages: 1 }) as T,
      })
    ).done,
  ).toBe(true);
}
beforeAll(setupDb);
beforeEach(resetDb);
afterAll(teardownDb);
describe("reporting reconciliation", () => {
  it("imports an external sale and rewards a new milestone once", async () => {
    const merchant = await fixture({ ...defaultProgram, n: 2 });
    await purchase(merchant, { at: new Date(Date.now() - 86400000) });
    await reconcile(merchant.id, [row("EXTERNAL")]);
    expect(await getDb().select().from(captures)).toHaveLength(2);
    expect(await getDb().select().from(rewards)).toMatchObject([
      { state: "SCHEDULED" },
    ]);
    await reconcile(merchant.id, [row("EXTERNAL")]);
    expect(await getDb().select().from(rewards)).toHaveLength(1);
    expect(
      (await getDb().select().from(connections))[0].lastReconciledAt,
    ).not.toBeNull();
  });
  it("rematches an earned refund after a missing receipt without deducting money twice", async () => {
    const merchant = await fixture({ ...defaultProgram, n: 2 }),
      earned = await milestone(merchant);
    await applyRewardRefund(earned.reward.id, {
      id: "RF1",
      status: "COMPLETED",
      amountCents: 200,
    });
    const [before] = await getDb()
      .select()
      .from(captures)
      .where(eq(captures.id, earned.reward.captureId!));
    await getDb().delete(refundReceipts).where(eq(refundReceipts.id, "RF1"));
    const refund = row("RF1", "T1107", earned.reward.captureId!, "-2.00");
    refund.transaction_info!.custom_field = `KICKBACK:R:${earned.reward.id}`;
    await reconcile(merchant.id, [refund]);
    const [after] = await getDb()
      .select()
      .from(captures)
      .where(eq(captures.id, earned.reward.captureId!));
    expect(after.refundableCents).toBe(before.refundableCents);
    expect(after.refundCount).toBe(before.refundCount);
    expect(await getDb().select().from(refundReceipts)).toMatchObject([
      { kind: "REWARD", status: "COMPLETED" },
    ]);
  });
  it("finds a foreign refund and preserves the existing clawback rules", async () => {
    const merchant = await fixture({ ...defaultProgram, n: 2 }),
      earned = await milestone(merchant);
    await applyRewardRefund(earned.reward.id, {
      id: "OWN",
      status: "COMPLETED",
      amountCents: 200,
    });
    await reconcile(merchant.id, [
      row("FOREIGN", "T1107", earned.reward.captureId!, "-3.50"),
    ]);
    expect(await getDb().select().from(offsets)).toMatchObject([
      { kind: "DEBIT", amountCents: 200 },
    ]);
  });
  it("applies unordered chargeback/undo rows after their sale without overriding other disputes", async () => {
    const merchant = await fixture();
    await reconcile(merchant.id, [
      row("RISK", "T1201", "SALE", "-5.50", new Date(Date.now() - 1800000)),
      row("SALE"),
    ]);
    expect(await getDb().select().from(customers)).toMatchObject([
      { status: "FROZEN" },
    ]);
    await reconcile(merchant.id, [
      row("UNDO", "T1202", "SALE", "5.50", new Date(Date.now() - 900000)),
    ]);
    expect(await getDb().select().from(customers)).toMatchObject([
      { status: "OK" },
    ]);
    expect(await getDb().select().from(disputes)).toMatchObject([
      { status: "RESOLVED" },
    ]);
  });
});
