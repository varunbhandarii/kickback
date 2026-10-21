import { and, eq, or, sql } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { getDb } from "@/db";
import {
  account,
  auditLog,
  merchantUsers,
  settings,
  user,
  verification,
} from "@/db/schema";
import { disconnectTx } from "./merchant-actions";
import { lockMerchant } from "./ledger/locks";
import { isDemoEmail } from "./demo/accounts";
export async function deleteMerchantAccount(
  userId: string,
  password: string,
  sessionCreatedAt: Date,
) {
  if (Date.now() - sessionCreatedAt.getTime() > 15 * 60000)
    throw new Error("Sign in again before deleting your account");
  const [credential] = await getDb()
    .select()
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential")),
    );
  if (
    credential?.password &&
    !(await verifyPassword({ hash: credential.password, password }))
  )
    throw new Error("Confirm your current password");
  await getDb().transaction(async (tx) => {
    const [person] = await tx
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .for("update");
    if (!person || isDemoEmail(person.email))
      throw new Error("This demo account cannot be deleted");
    const memberships = await tx
      .select()
      .from(merchantUsers)
      .where(eq(merchantUsers.userId, userId));
    for (const membership of memberships.toSorted((a, b) =>
      a.merchantId.localeCompare(b.merchantId),
    )) {
      await lockMerchant(tx, membership.merchantId);
      const owners = await tx
        .select()
        .from(merchantUsers)
        .where(
          and(
            eq(merchantUsers.merchantId, membership.merchantId),
            eq(merchantUsers.role, "OWNER"),
          ),
        );
      if (owners.every((owner) => owner.userId === userId))
        await disconnectTx(tx, membership.merchantId);
    }
    await tx
      .delete(settings)
      .where(
        and(
          sql`${settings.key} like 'invite:%'`,
          sql`${settings.value}->>'invitedBy' = ${userId}`,
        ),
      );
    await tx
      .delete(verification)
      .where(
        or(
          eq(verification.identifier, person.email),
          sql`position(${person.email} in ${verification.value}) > 0`,
          sql`position(${userId} in ${verification.value}) > 0`,
        ),
      );
    await tx
      .update(auditLog)
      .set({ actor: "deleted-account" })
      .where(eq(auditLog.actor, userId));
    await tx
      .update(auditLog)
      .set({ subject: "account" })
      .where(eq(auditLog.subject, userId));
    await tx.delete(user).where(eq(user.id, userId));
  });
}
