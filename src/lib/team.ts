import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { merchants, merchantUsers, settings, user } from "@/db/schema";
import { assertConnectionOwner } from "./connections";
import { customerKey } from "./crypto/tenant";
import { emailConfigured, sendMerchantEmail } from "./email";
import { getEnv } from "./env";
import { lockMerchant } from "./ledger/locks";
import { audit } from "./audit";
import { isDemoEmail } from "./demo/accounts";
type Invite = { emailHash: string; expiresAt: string; invitedBy: string };
const emailSchema = z
  .email()
  .max(254)
  .transform((email) => email.trim().toLowerCase());
const inviteKey = (merchantId: string, token: string) =>
  `invite:${merchantId}:${customerKey(merchantId, `invite:${token}`)}`;
export async function inviteOwner(
  userId: string,
  merchantId: string,
  emailInput: unknown,
) {
  if (!emailConfigured())
    throw new Error("Set up merchant email before inviting an owner");
  const email = emailSchema.parse(emailInput);
  // Shared demo identities are signed in by the public; they can never be owners.
  if (isDemoEmail(email)) throw new Error("Demo accounts cannot be invited");
  const token = randomBytes(32).toString("base64url"),
    key = inviteKey(merchantId, token);
  const merchant = await getDb().transaction(async (tx) => {
    await assertConnectionOwner(tx, userId, merchantId);
    await lockMerchant(tx, merchantId);
    const [actor] = await tx.select().from(user).where(eq(user.id, userId));
    if (!actor?.emailVerified)
      throw new Error("Verify your own email before inviting owners");
    const pending = await tx
      .select()
      .from(settings)
      .where(sql`${settings.key} like ${`invite:${merchantId}:%`}`);
    if (pending.length >= 20) throw new Error("Too many pending invitations");
    const [business] = await tx
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchantId));
    await tx.insert(settings).values({
      key,
      value: {
        emailHash: customerKey(merchantId, `owner-email:${email}`),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        invitedBy: userId,
      } satisfies Invite,
    });
    return business;
  });
  const url = new URL("/invite", getEnv().APP_URL);
  url.searchParams.set("merchant", merchantId);
  url.searchParams.set("token", token);
  try {
    await sendMerchantEmail(
      email,
      `Join ${merchant.displayName} on Kickback`,
      `You have been invited as a co-owner, with full access to settings, customer codes, and reward controls. Sign up or sign in with this email, verify it, then accept within seven days: ${url.href}`,
    );
  } catch {
    await getDb().delete(settings).where(eq(settings.key, key));
    throw new Error("Invitation email could not be delivered");
  }
}
export async function acceptOwnerInvite(
  userId: string,
  merchantId: string,
  token: string,
) {
  if (
    !z.uuid().safeParse(merchantId).success ||
    !/^[A-Za-z0-9_-]{43}$/.test(token)
  )
    throw new Error("Invitation invalid");
  await getDb().transaction(async (tx) => {
    await lockMerchant(tx, merchantId);
    const [person] = await tx.select().from(user).where(eq(user.id, userId)),
      key = inviteKey(merchantId, token),
      [stored] = await tx
        .select()
        .from(settings)
        .where(eq(settings.key, key))
        .for("update");
    const invitation = stored?.value as Invite | undefined;
    if (
      !person?.emailVerified ||
      !invitation ||
      new Date(invitation.expiresAt) <= new Date() ||
      invitation.emailHash !==
        customerKey(merchantId, `owner-email:${person.email.toLowerCase()}`)
    )
      throw new Error(
        "Verify the invited email and use an unexpired invitation",
      );
    await assertConnectionOwner(tx, invitation.invitedBy, merchantId);
    await tx
      .insert(merchantUsers)
      .values({ userId, merchantId, role: "OWNER" })
      .onConflictDoNothing();
    await tx.delete(settings).where(eq(settings.key, key));
    await audit(
      tx,
      merchantId,
      "owner.invitation_accepted",
      userId,
      {},
      userId,
    );
  });
}
export async function removeOwner(
  userId: string,
  merchantId: string,
  targetId: string,
) {
  await getDb().transaction(async (tx) => {
    await assertConnectionOwner(tx, userId, merchantId);
    await lockMerchant(tx, merchantId);
    const owners = await tx
      .select()
      .from(merchantUsers)
      .where(
        and(
          eq(merchantUsers.merchantId, merchantId),
          eq(merchantUsers.role, "OWNER"),
        ),
      );
    if (owners.length <= 1 || targetId === userId)
      throw new Error("The last owner cannot be removed here");
    await tx
      .delete(merchantUsers)
      .where(
        and(
          eq(merchantUsers.merchantId, merchantId),
          eq(merchantUsers.userId, targetId),
        ),
      );
    await tx
      .delete(settings)
      .where(
        and(
          sql`${settings.key} like ${`invite:${merchantId}:%`}`,
          sql`${settings.value}->>'invitedBy' = ${targetId}`,
        ),
      );
    await audit(tx, merchantId, "owner.removed", targetId, {}, userId);
  });
}
