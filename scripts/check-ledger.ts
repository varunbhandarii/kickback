import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import {
  merchants,
  connections,
  programs,
  customers,
  orders,
  visits,
  captures,
  rewards,
  auditLog,
  offsets,
} from "../src/db/schema";
import { defaultProgram } from "../src/lib/engine/program";
import { loadMerchant } from "../src/lib/merchants";
import { recordCapture } from "../src/lib/ledger/record-capture";
if (process.env.KICKBACK_ENV !== "sandbox")
  throw new Error("Sandbox database required");
const db = getDb(),
  id = randomUUID(),
  slug = `ledger-check-${id}`;
try {
  await db
    .insert(merchants)
    .values({ id, slug, status: "ACTIVE", displayName: "Ledger check" });
  await db.insert(connections).values({
    merchantId: id,
    mode: "PARTNER",
    merchantIdInPayPal: "MERCHANT12345",
  });
  await db.insert(programs).values({
    merchantId: id,
    version: 1,
    status: "ACTIVE",
    spec: { ...defaultProgram, n: 2 },
  });
  const merchant = (await loadMerchant(slug))!;
  for (const [index, minutes] of [0, 119, 241].entries()) {
    const orderId = randomUUID().replaceAll("-", "").toUpperCase(),
      at = new Date(Date.now() - 86400000 + minutes * 60000);
    await db.insert(orders).values({
      id: orderId,
      merchantId: id,
      requestId: randomUUID(),
      wallet: "PAYPAL",
      amountCents: 550,
      status: "COMPLETED",
    });
    await recordCapture({
      merchant,
      source: "REPLAY",
      order: {
        id: orderId,
        status: "COMPLETED",
        payment_source: { paypal: { account_id: "SYNTHETIC_PAYER" } },
        purchase_units: [
          {
            payee: { merchant_id: "MERCHANT12345" },
            payments: {
              captures: [
                {
                  id: `CHECK${index}-${id}`,
                  status: "COMPLETED",
                  create_time: at.toISOString(),
                  amount: { value: "5.50", currency_code: "USD" },
                },
              ],
            },
          },
        ],
      },
    });
  }
  const visitRows = await db
      .select()
      .from(visits)
      .where(eq(visits.merchantId, id)),
    rewardRows = await db
      .select()
      .from(rewards)
      .where(eq(rewards.merchantId, id));
  if (visitRows.length !== 2 || rewardRows.length !== 1)
    throw new Error("Ledger merge/enqueue check failed");
  console.log(
    JSON.stringify({
      ok: true,
      synthetic: true,
      providerCalls: 0,
      captures: 3,
      visits: visitRows.length,
      rewards: rewardRows.length,
    }),
  );
} finally {
  await db.transaction(async (tx) => {
    await tx.delete(auditLog).where(eq(auditLog.merchantId, id));
    await tx.delete(offsets).where(eq(offsets.merchantId, id));
    await tx.delete(rewards).where(eq(rewards.merchantId, id));
    await tx.delete(captures).where(eq(captures.merchantId, id));
    await tx.delete(orders).where(eq(orders.merchantId, id));
    await tx.delete(visits).where(eq(visits.merchantId, id));
    await tx.delete(customers).where(eq(customers.merchantId, id));
    await tx.delete(programs).where(eq(programs.merchantId, id));
    await tx.delete(connections).where(eq(connections.merchantId, id));
    await tx.delete(merchants).where(eq(merchants.id, id));
  });
  await closeDb();
}
