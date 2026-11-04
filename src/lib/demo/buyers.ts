import { and, asc, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { demoBuyers, merchants } from "@/db/schema";
import { decryptSecret, encryptSecret } from "../crypto/tenant";
import { getEnv } from "../env";
export type DemoBuyer = typeof demoBuyers.$inferSelect;
/** A pay-path reservation lasts long enough for one unhurried checkout. */
export const RESERVATION_MS = 30 * 60000;
export const DEMO_TICKET_CENTS = 550;
const credentialsSchema = z.array(
  z.object({ email: z.email(), password: z.string().min(1).max(128) }),
);
/** Published sandbox logins, kept in env so a rotation needs no commit. */
export function publishedCredentials() {
  const raw = getEnv().DEMO_BUYER_CREDENTIALS_JSON;
  if (!raw) return new Map<string, string>();
  try {
    return new Map(
      credentialsSchema
        .parse(JSON.parse(raw))
        .map((c) => [c.email.toLowerCase(), c.password]),
    );
  } catch {
    console.error(JSON.stringify({ action: "demo_credentials_invalid" }));
    return new Map<string, string>();
  }
}
async function merchantIdFor(slug: string) {
  const [row] = await getDb()
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.slug, slug));
  if (!row) throw new Error("Demo business not found");
  return row.id;
}
export const buyerInput = z.object({
  slot: z.number().int().min(0).max(99),
  merchantSlug: z.string().regex(/^[a-z0-9-]{1,64}$/).default("rosas"),
  email: z.email().transform((v) => v.toLowerCase()),
  purpose: z.enum(["pay", "watch"]).default("pay"),
  published: z.boolean().default(true),
  status: z.enum(["cooling", "disabled"]).optional(),
  notes: z.string().max(500).optional(),
});
/** Registers or updates a pool buyer. Changing the wallet resets its demo state. */
export async function upsertBuyer(
  input: z.input<typeof buyerInput>,
  vaultId?: string,
) {
  const value = buyerInput.parse(input);
  const merchantId = await merchantIdFor(value.merchantSlug);
  const vaultEnc = vaultId
    ? encryptSecret(vaultId, merchantId).toString("base64")
    : undefined;
  const [row] = await getDb()
    .insert(demoBuyers)
    .values({
      ...value,
      status: value.status ?? "cooling",
      vaultEnc,
    })
    .onConflictDoUpdate({
      target: demoBuyers.slot,
      set: {
        merchantSlug: value.merchantSlug,
        email: value.email,
        purpose: value.purpose,
        published: value.published,
        ...(value.status ? { status: value.status } : {}),
        ...(value.notes !== undefined ? { notes: value.notes } : {}),
        ...(vaultEnc
          ? { vaultEnc, customerKey: null, status: value.status ?? "cooling" }
          : {}),
        updatedAt: new Date(),
      },
    })
    .returning();
  return publicBuyer(row);
}
export async function buyerVault(buyer: DemoBuyer) {
  if (!buyer.vaultEnc) return undefined;
  return decryptSecret(
    Buffer.from(buyer.vaultEnc, "base64"),
    await merchantIdFor(buyer.merchantSlug),
  );
}
/** Operator view: never the wallet or the customer key. */
export function publicBuyer(b: DemoBuyer) {
  return {
    slot: b.slot,
    merchantSlug: b.merchantSlug,
    email: b.email,
    purpose: b.purpose,
    published: b.published,
    status: b.status,
    hasWallet: Boolean(b.vaultEnc),
    linked: Boolean(b.customerKey),
    reservedUntil: b.reservedUntil,
    lastRewardAt: b.lastRewardAt,
    lastStagedAt: b.lastStagedAt,
    notes: b.notes,
  };
}
export async function listBuyers() {
  const rows = await getDb()
    .select()
    .from(demoBuyers)
    .orderBy(asc(demoBuyers.slot));
  return rows.map(publicBuyer);
}
/** Returns expired reservations to the pool; the staging pass re-checks them. */
export async function releaseExpired(now = new Date()) {
  const rows = await getDb()
    .update(demoBuyers)
    .set({ status: "cooling", reservedBy: null, reservedUntil: null, updatedAt: now })
    .where(
      and(eq(demoBuyers.status, "reserved"), lt(demoBuyers.reservedUntil, now)),
    )
    .returning({ slot: demoBuyers.slot });
  return rows.length;
}
/**
 * Hands one ready buyer to a visitor (pay) or a run (watch), least recently
 * rewarded first. The same holder gets the same buyer back while it lasts.
 */
export async function reserveBuyer(
  purpose: "pay" | "watch",
  holder: string,
  now = new Date(),
  /** Pay buyers can only be handed out when their login is published. */
  emails?: string[],
) {
  if (emails && !emails.length) return undefined;
  return getDb().transaction(async (tx) => {
    const [held] = await tx
      .select()
      .from(demoBuyers)
      .where(
        and(
          eq(demoBuyers.reservedBy, holder),
          eq(demoBuyers.status, "reserved"),
          gt(demoBuyers.reservedUntil, now),
        ),
      );
    if (held) return held;
    const [next] = await tx
      .select()
      .from(demoBuyers)
      .where(
        and(
          eq(demoBuyers.purpose, purpose),
          eq(demoBuyers.status, "ready"),
          isNotNull(demoBuyers.vaultEnc),
          ...(purpose === "pay" ? [eq(demoBuyers.published, true)] : []),
          ...(emails ? [inArray(demoBuyers.email, emails)] : []),
        ),
      )
      .orderBy(
        sql`${demoBuyers.lastRewardAt} asc nulls first`,
        asc(demoBuyers.slot),
      )
      .limit(1)
      .for("update", { skipLocked: true });
    if (!next) return undefined;
    const [row] = await tx
      .update(demoBuyers)
      .set({
        status: "reserved",
        reservedBy: holder,
        reservedUntil: new Date(+now + RESERVATION_MS),
        updatedAt: now,
      })
      .where(eq(demoBuyers.slot, next.slot))
      .returning();
    return row;
  });
}
/** After a reward (or a failed run) the buyer waits for the next staging pass. */
export async function coolBuyer(slot: number, rewarded: boolean, note?: string) {
  const now = new Date();
  await getDb()
    .update(demoBuyers)
    .set({
      status: "cooling",
      reservedBy: null,
      reservedUntil: null,
      ...(rewarded ? { lastRewardAt: now } : {}),
      ...(note !== undefined ? { notes: note } : {}),
      updatedAt: now,
    })
    .where(eq(demoBuyers.slot, slot));
}
/** Buyers ready to be handed out for one purpose (pay counts only published ones). */
export async function readyCount(purpose: "pay" | "watch") {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(demoBuyers)
    .where(
      and(
        eq(demoBuyers.purpose, purpose),
        eq(demoBuyers.status, "ready"),
        isNotNull(demoBuyers.vaultEnc),
        ...(purpose === "pay" ? [eq(demoBuyers.published, true)] : []),
      ),
    );
  return row.n;
}
export async function poolCounts() {
  const rows = await getDb()
    .select({
      purpose: demoBuyers.purpose,
      status: demoBuyers.status,
      published: demoBuyers.published,
      n: sql<number>`count(*)::int`,
    })
    .from(demoBuyers)
    .where(inArray(demoBuyers.status, ["ready", "reserved", "cooling", "staging"]))
    .groupBy(demoBuyers.purpose, demoBuyers.status, demoBuyers.published);
  const count = (purpose: string, status: string) =>
    rows
      .filter(
        (r) =>
          r.purpose === purpose &&
          r.status === status &&
          (purpose === "watch" || r.published),
      )
      .reduce((s, r) => s + r.n, 0);
  return {
    payReady: count("pay", "ready"),
    payReserved: count("pay", "reserved"),
    payCooling: count("pay", "cooling") + count("pay", "staging"),
    watchReady: count("watch", "ready"),
    watchCooling: count("watch", "cooling") + count("watch", "staging"),
  };
}
/** The pay-path buyer this browser already holds, if the hold is still running. */
export async function heldBuyer(holder: string, now = new Date()) {
  const [row] = await getDb()
    .select()
    .from(demoBuyers)
    .where(
      and(
        eq(demoBuyers.reservedBy, holder),
        eq(demoBuyers.status, "reserved"),
        gt(demoBuyers.reservedUntil, now),
      ),
    );
  return row;
}
