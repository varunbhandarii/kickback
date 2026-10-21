import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  account,
  user,
  merchantUsers,
  connections,
  merchants,
  programs,
  type MenuItem,
} from "@/db/schema";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { encryptSecret } from "../crypto/tenant";
import { defaultProgram, loadProgram } from "../engine/program";
import { getEnv } from "../env";
import { DEMO_OWNER_EMAIL, DEMO_VIEWER_EMAIL } from "../demo/accounts";
const demos = [
  {
    slug: "rosas",
    prefix: "ROSAS",
    name: "Rosa's Cafe",
    menu: [
      { id: "drip", name: "Drip coffee", priceCents: 365 },
      { id: "latte", name: "Latte", priceCents: 550 },
      { id: "cold-brew", name: "Cold brew", priceCents: 558 },
      { id: "pastry", name: "Pastry", priceCents: 425 },
    ],
    spec: defaultProgram,
  },
  {
    slug: "salon",
    prefix: "SALON",
    name: "Bright Salon",
    menu: [
      { id: "cut", name: "Haircut", priceCents: 3500 },
      { id: "style", name: "Styling", priceCents: 2500 },
      { id: "treatment", name: "Treatment", priceCents: 4000 },
      { id: "trim", name: "Trim", priceCents: 2000 },
    ],
    spec: {
      ...defaultProgram,
      n: 4,
      rewardCents: 500,
      windowDays: 120,
      minTicketCents: 2000,
    },
  },
  {
    slug: "bakery",
    prefix: "BAKERY",
    name: "Loaf Bakery",
    menu: [
      { id: "loaf", name: "Sourdough loaf", priceCents: 850 },
      { id: "croissant", name: "Croissant", priceCents: 450 },
      { id: "bagel", name: "Bagel", priceCents: 350 },
      { id: "cake", name: "Cake slice", priceCents: 650 },
    ],
    spec: {
      ...defaultProgram,
      type: "SPEND_MILESTONE",
      spendCents: 4000,
      rewardCents: 300,
      windowDays: 45,
      noteTemplate: "Thanks for {n}: a loyalty reward from {merchant}",
    },
  },
];
/** Creates a password account once; `rotate` keeps a server-held password in step with env. */
async function credentialUser(
  email: string,
  name: string,
  plain: string,
  rotate = false,
) {
  const [found] = await getDb().select().from(user).where(eq(user.email, email));
  if (found) {
    if (rotate) {
      const [credential] = await getDb()
        .select()
        .from(account)
        .where(
          and(eq(account.userId, found.id), eq(account.providerId, "credential")),
        );
      if (
        credential?.password &&
        !(await verifyPassword({ hash: credential.password, password: plain }))
      )
        await getDb()
          .update(account)
          .set({ password: await hashPassword(plain), updatedAt: new Date() })
          .where(eq(account.id, credential.id));
    }
    return found;
  }
  const password = await hashPassword(plain),
    id = randomUUID();
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(user)
      .values({
        id,
        name,
        email,
        emailVerified: true,
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (!row)
      return (await tx.select().from(user).where(eq(user.email, email)))[0];
    await tx.insert(account).values({
      id: randomUUID(),
      accountId: id,
      userId: id,
      providerId: "credential",
      password,
      updatedAt: new Date(),
    });
    return row;
  });
}
export async function seedDemo() {
  const env = getEnv(),
    seeded: string[] = [],
    skipped: { slug: string; reason: string }[] = [];
  if (env.KICKBACK_ENV !== "sandbox")
    throw new Error("Demo seed requires sandbox");
  if (!env.DEMO_USER_PASSWORD)
    throw new Error("Set DEMO_USER_PASSWORD using npm run env:init");
  const owner = await credentialUser(
    DEMO_OWNER_EMAIL,
    "Demo merchant",
    env.DEMO_USER_PASSWORD,
  );
  // The read-only visitor account; its password never leaves the server.
  const viewer = env.DEMO_VIEWER_PASSWORD
    ? await credentialUser(
        DEMO_VIEWER_EMAIL,
        "Demo visitor",
        env.DEMO_VIEWER_PASSWORD,
        true,
      )
    : undefined;
  for (const demo of demos) {
    const id = process.env[`MERCHANT_${demo.prefix}_ID`];
    if (!id || !/^[A-Z0-9]{13}$/.test(id))
      throw new Error(`Set MERCHANT_${demo.prefix}_ID`);
    const mode = (
      process.env[`MERCHANT_${demo.prefix}_CONNECTION_MODE`] ??
      env.PAYPAL_CONNECTION_MODE
    ).toUpperCase() as "PARTNER" | "BYO";
    if (mode !== "PARTNER" && mode !== "BYO")
      throw new Error("Invalid connection mode");
    const clientId = process.env[`MERCHANT_${demo.prefix}_CLIENT_ID`],
      secret = process.env[`MERCHANT_${demo.prefix}_CLIENT_SECRET`];
    if (mode === "BYO" && (!clientId || !secret))
      throw new Error(`Set MERCHANT_${demo.prefix} REST credentials`);
    const spec = loadProgram(demo.spec);
    await getDb().transaction(async (tx) => {
      const [created] = await tx
        .insert(merchants)
        .values({
          slug: demo.slug,
          status: "ACTIVE",
          displayName: demo.name,
          menu: demo.menu as MenuItem[],
        })
        .onConflictDoNothing()
        .returning();
      const merchant =
        created ??
        (
          await tx.select().from(merchants).where(eq(merchants.slug, demo.slug))
        )[0];
      await tx
        .insert(merchantUsers)
        .values({ userId: owner.id, merchantId: merchant.id })
        .onConflictDoNothing();
      if (viewer)
        await tx
          .insert(merchantUsers)
          .values({ userId: viewer.id, merchantId: merchant.id, role: "VIEWER" })
          .onConflictDoNothing();
      if (merchant.status === "DISCONNECTED" || merchant.purgeAfter) {
        skipped.push({
          slug: demo.slug,
          reason: merchant.purgeAfter ? "scheduled for deletion" : "disconnected",
        });
        return;
      }
      const [old] = await tx
        .select()
        .from(connections)
        .where(eq(connections.merchantId, merchant.id));
      const value = {
        merchantId: merchant.id,
        merchantIdInPayPal: id,
        mode,
        clientId: mode === "BYO" ? clientId : null,
        clientSecretEnc:
          mode === "BYO" ? encryptSecret(secret!, merchant.id) : null,
        grantedFeatures: old?.grantedFeatures ?? [
          "PAYMENT",
          "REFUND",
          "ADVANCED_TRANSACTIONS_SEARCH",
          "ACCESS_MERCHANT_INFORMATION",
        ],
        consentStatus: old?.consentStatus ?? "UNKNOWN",
        webhookId:
          process.env[`MERCHANT_${demo.prefix}_WEBHOOK_ID`] ||
          old?.webhookId ||
          (mode === "PARTNER"
            ? (env.PAYPAL_WEBHOOK_ID as string | undefined)
            : undefined),
        updatedAt: new Date(),
        status: old?.status ?? "PENDING",
        scopes: old?.scopes ?? [],
      };
      await tx.insert(connections).values(value).onConflictDoNothing();
      const explicitWebhook = process.env[`MERCHANT_${demo.prefix}_WEBHOOK_ID`];
      if (
        old &&
        old.mode === mode &&
        explicitWebhook &&
        old.webhookId !== explicitWebhook
      )
        await tx
          .update(connections)
          .set({ webhookId: explicitWebhook, updatedAt: new Date() })
          .where(eq(connections.merchantId, merchant.id));
      await tx
        .insert(programs)
        .values({
          merchantId: merchant.id,
          version: 1,
          status: "ACTIVE",
          spec,
          effectiveFrom: new Date(0),
          provenance: { source: "demo-seed" },
        })
        .onConflictDoNothing();
      const previous = await tx
        .select()
        .from(programs)
        .where(eq(programs.merchantId, merchant.id));
      for (const program of previous)
        if ((program.provenance as { source?: string }).source === "demo-seed")
          await tx
            .update(programs)
            .set({ effectiveFrom: new Date(0) })
            .where(eq(programs.id, program.id));
    });
    if (!skipped.some((s) => s.slug === demo.slug)) seeded.push(demo.slug);
  }
  return { seeded, skipped, viewer: Boolean(viewer) };
}
