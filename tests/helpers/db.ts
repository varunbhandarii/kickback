import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, desc, eq, sql } from "drizzle-orm";
import { vi } from "vitest";
import { setTestDb, type Db, getDb } from "@/db";
import * as schema from "@/db/schema";
import { defaultProgram, type ProgramSpec } from "@/lib/engine/program";
import { loadMerchant } from "@/lib/merchants";
import { recordCapture, type CaptureOrder } from "@/lib/ledger/record-capture";
import { customerKey } from "@/lib/crypto/tenant";
let pg: PGlite;
export async function setupDb() {
  vi.stubEnv("DEMO_USER_PASSWORD", "testing-demo-password");
  vi.stubEnv("BETTER_AUTH_SECRET", "testing-auth-secret-".repeat(3));
  for (const [key, value] of Object.entries({
    APP_URL: "https://app.test",
    KICKBACK_ENV: "sandbox",
    DEMO_MODE: "true",
    KICKBACK_PAUSE_REWARDS: "false",
    PAYPAL_CLIENT_ID: "client",
    PAYPAL_CLIENT_SECRET: "secret",
    KICKBACK_MASTER_KEY: Buffer.alloc(32, 1).toString("base64"),
    JOBS_BEARER: "x".repeat(32),
    DATABASE_URL: "postgres://test:test@localhost/test",
  }))
    vi.stubEnv(key, value);
  pg = new PGlite();
  for (const file of readdirSync("drizzle")
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync(`drizzle/${file}`, "utf8"));
  setTestDb(drizzle(pg, { schema }) as unknown as Db);
}
export async function resetDb() {
  await getDb().execute(
    sql`truncate merchants, settings, webhook_events, raw_events, refund_receipts cascade`,
  );
}
export async function teardownDb() {
  setTestDb();
  await pg.close();
  vi.unstubAllEnvs();
}
export async function fixture(
  spec: ProgramSpec = { ...defaultProgram },
  slug = "rosas",
) {
  const [merchant] = await getDb()
    .insert(schema.merchants)
    .values({
      slug,
      status: "ACTIVE",
      displayName: "Rosa's Cafe",
      menu: [{ id: "latte", name: "Latte", priceCents: 550 }],
    })
    .returning();
  await getDb().insert(schema.connections).values({
    merchantId: merchant.id,
    mode: "PARTNER",
    merchantIdInPayPal: "MERCHANT12345",
    consentStatus: "GRANTED",
    status: "CONNECTED",
  });
  await getDb()
    .insert(schema.programs)
    .values({
      merchantId: merchant.id,
      version: 1,
      spec,
      status: "ACTIVE",
      effectiveFrom: new Date(0),
    });
  return (await loadMerchant(slug))!;
}
export async function purchase(
  merchant: Awaited<ReturnType<typeof fixture>>,
  options: {
    at?: Date;
    status?: string;
    amount?: number;
    account?: string | null;
    wallet?: "paypal" | "venmo";
    id?: string;
  } = {},
) {
  const id = options.id ?? randomUUID().replaceAll("-", "").toUpperCase(),
    amount = options.amount ?? 550,
    wallet = options.wallet ?? "paypal";
  const order: CaptureOrder = {
    id: `O${id}`,
    status: options.status ?? "COMPLETED",
    payment_source:
      options.account === null
        ? undefined
        : { [wallet]: { account_id: options.account ?? "PRIVATE_BUYER_ID" } },
    purchase_units: [
      {
        payee: { merchant_id: "MERCHANT12345" },
        payments: {
          captures: [
            {
              id: `C${id}`,
              status: options.status ?? "COMPLETED",
              create_time: (options.at ?? new Date()).toISOString(),
              amount: {
                value: (amount / 100).toFixed(2),
                currency_code: "USD",
              },
            },
          ],
        },
      },
    ],
  };
  await getDb()
    .insert(schema.orders)
    .values({
      id: order.id,
      merchantId: merchant.id,
      requestId: randomUUID(),
      wallet: wallet.toUpperCase() as "PAYPAL" | "VENMO",
      amountCents: amount,
      status: order.status,
    })
    .onConflictDoNothing();
  return {
    order,
    result: await recordCapture({ merchant, order, source: "PAY_PAGE" }),
  };
}
export async function milestone(
  merchant: Awaited<ReturnType<typeof fixture>>,
  account = "PRIVATE_BUYER_ID",
) {
  if (merchant.spec.type !== "VISIT_MILESTONE")
    throw new Error("Visit spec required");
  let last: Awaited<ReturnType<typeof purchase>> | undefined;
  for (let n = 0; n < merchant.spec.n; n++)
    last = await purchase(merchant, {
      at: new Date(Date.now() - (merchant.spec.n - n) * 86400000),
      account,
    });
  const [reward] = await getDb()
    .select()
    .from(schema.rewards)
    .where(
      and(
        eq(schema.rewards.merchantId, merchant.id),
        eq(schema.rewards.customerKey, customerKey(merchant.id, account)),
      ),
    )
    .orderBy(desc(schema.rewards.createdAt));
  return { ...last!, reward };
}
