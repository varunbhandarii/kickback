import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  backfillRuns,
  merchants,
  merchantUsers,
  programs,
  connections,
  customers,
} from "@/db/schema";
import { audit } from "./audit";
import {
  businessSchema,
  defaultMenu,
  menuSchema,
  preset,
} from "./merchant-inputs";
import { loadProgram, rewardNote, type ProgramSpec } from "./engine/program";
import { enqueue } from "./rewards/enqueue";
import { lockMerchant } from "./ledger/locks";
async function ownership(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  userId: string,
  merchantId: string,
) {
  const [membership] = await tx
    .select()
    .from(merchantUsers)
    .where(
      and(
        eq(merchantUsers.userId, userId),
        eq(merchantUsers.merchantId, merchantId),
        eq(merchantUsers.role, "OWNER"),
      ),
    );
  if (!membership) throw new Error("Business access denied");
}
export async function saveBusiness(
  userId: string,
  input: unknown,
  merchantId?: string,
) {
  const fields = businessSchema.parse(input);
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`owner:${userId}`}))`,
    );
    if (merchantId) {
      await ownership(tx, userId, merchantId);
      await lockMerchant(tx, merchantId);
      const [current] = await tx
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId));
      if (current.slugLocked && current.slug !== fields.slug)
        throw new Error("Your printed pay link is locked");
      const [updated] = await tx
        .update(merchants)
        .set({
          ...fields,
          onboardingStep:
            current.onboardingStep === "business"
              ? "connect"
              : current.onboardingStep,
        })
        .where(eq(merchants.id, merchantId))
        .returning();
      return updated;
    }
    const [existing] = await tx
      .select()
      .from(merchantUsers)
      .where(eq(merchantUsers.userId, userId));
    if (existing) throw new Error("This account already has a business");
    const [merchant] = await tx
      .insert(merchants)
      .values({
        ...fields,
        id: randomUUID(),
        status: "ONBOARDING",
        onboardingStep: "connect",
        menu: defaultMenu(fields.category),
      })
      .returning();
    await tx
      .insert(merchantUsers)
      .values({ userId, merchantId: merchant.id, role: "OWNER" });
    await tx.insert(programs).values({
      merchantId: merchant.id,
      version: 1,
      status: "DRAFT",
      spec: preset(fields.category),
      provenance: { source: "preset", category: fields.category },
    });
    await audit(tx, merchant.id, "merchant.created", merchant.id, {
      category: fields.category,
    });
    return merchant;
  });
}
export async function activateProgram(
  userId: string,
  merchantId: string,
  input: unknown,
) {
  const spec = loadProgram(input);
  return getDb().transaction(async (tx) => {
    await ownership(tx, userId, merchantId);
    await lockMerchant(tx, merchantId);
    const [connection] = await tx
      .select()
      .from(connections)
      .where(eq(connections.merchantId, merchantId));
    if (connection?.status !== "CONNECTED")
      throw new Error("Connect your PayPal business before activating");
    const [merchant] = await tx
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchantId));
    if (merchant.purgeAfter)
      throw new Error("Reconnect your business before activating");
    const [importing] = await tx
      .select()
      .from(backfillRuns)
      .where(
        and(
          eq(backfillRuns.merchantId, merchantId),
          eq(backfillRuns.kind, "BACKFILL"),
          inArray(backfillRuns.status, ["QUEUED", "RUNNING"]),
        ),
      );
    if (importing)
      throw new Error("Wait for history to finish before activating");
    rewardNote(spec, merchant.displayName);
    const previous = await tx
      .select()
      .from(programs)
      .where(eq(programs.merchantId, merchantId))
      .orderBy(desc(programs.version));
    const draft = previous.find((row) => row.status === "DRAFT");
    await tx
      .update(programs)
      .set({ status: "RETIRED", retiredAt: new Date() })
      .where(
        and(eq(programs.merchantId, merchantId), eq(programs.status, "ACTIVE")),
      );
    if (draft)
      await tx
        .update(programs)
        .set({
          spec,
          status: "ACTIVE",
          effectiveFrom: new Date(),
          provenance: { source: "preset", category: merchant.category },
        })
        .where(eq(programs.id, draft.id));
    else
      await tx.insert(programs).values({
        merchantId,
        version: (previous[0]?.version ?? 0) + 1,
        spec,
        status: "ACTIVE",
        effectiveFrom: new Date(),
        provenance: { source: "preset", category: merchant.category },
      });
    await tx
      .update(merchants)
      .set({ status: "ACTIVE", rewardsPaused: false, onboardingStep: "menu" })
      .where(eq(merchants.id, merchantId));
    const [active] = await tx
        .select()
        .from(programs)
        .where(
          and(
            eq(programs.merchantId, merchantId),
            eq(programs.status, "ACTIVE"),
          ),
        ),
      people = await tx
        .select()
        .from(customers)
        .where(eq(customers.merchantId, merchantId));
    for (const person of people)
      await enqueue(
        tx,
        { ...merchant, status: "ACTIVE", program: active, spec },
        person.key,
      );
    await audit(tx, merchantId, "program.activated", merchantId, {
      type: (spec as ProgramSpec).type,
    });
  });
}
export async function saveMenu(
  userId: string,
  merchantId: string,
  input: unknown,
  finish = false,
) {
  const menu = menuSchema.parse(input);
  await getDb().transaction(async (tx) => {
    await ownership(tx, userId, merchantId);
    await tx
      .update(merchants)
      .set({ menu, ...(finish ? { onboardingStep: "done" } : {}) })
      .where(eq(merchants.id, merchantId));
    await audit(tx, merchantId, "merchant.menu_updated", merchantId, {
      items: menu.length,
    });
  });
}
export async function lockSlug(userId: string, merchantId: string) {
  await getDb().transaction(async (tx) => {
    await ownership(tx, userId, merchantId);
    await tx
      .update(merchants)
      .set({ slugLocked: true })
      .where(eq(merchants.id, merchantId));
  });
}
