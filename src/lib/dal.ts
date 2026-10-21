import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants, merchantUsers } from "@/db/schema";
import { auth } from "./auth";
import { enforceSessionAge } from "./session-policy";
/** OWNER can change everything; VIEWER is the read-only demo membership. */
export type Role = "OWNER" | "VIEWER";
export const getSession = cache(async () => {
  const result = await auth.api.getSession({ headers: await headers() });
  return enforceSessionAge(result);
});
export const requireUser = cache(async () => {
  const result = await getSession();
  if (!result) redirect("/sign-in");
  return result.user;
});
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The user's first matching business with one of `roles`, and that role. */
export async function memberMerchant(
  userId: string,
  id?: string,
  roles: Role[] = ["OWNER"],
) {
  if (id && !UUID.test(id)) return undefined;
  const rows = await getDb()
    .select({ merchant: merchants, role: merchantUsers.role })
    .from(merchantUsers)
    .innerJoin(merchants, eq(merchants.id, merchantUsers.merchantId))
    .where(
      and(
        eq(merchantUsers.userId, userId),
        inArray(merchantUsers.role, roles),
        ...(id ? [eq(merchantUsers.merchantId, id)] : []),
      ),
    )
    .orderBy(merchants.createdAt, merchants.slug);
  return rows[0]
    ? { merchant: rows[0].merchant, role: rows[0].role as Role }
    : undefined;
}
/** Owner-only lookup used by every action that changes something. */
export async function ownedMerchant(userId: string, id?: string) {
  return (await memberMerchant(userId, id, ["OWNER"]))?.merchant;
}
/** Page reads: owners and read-only demo visitors. */
export const requireMerchant = cache(async () => {
  const user = await requireUser(),
    selected = (await cookies()).get("kickback.merchant")?.value;
  const found =
    (await memberMerchant(user.id, selected, ["OWNER", "VIEWER"])) ??
    (await memberMerchant(user.id, undefined, ["OWNER", "VIEWER"]));
  if (!found) redirect("/m/onboarding/business");
  return { user, merchant: found.merchant, role: found.role };
});
/** Owner-only page guard for setup and other pages that only make changes. */
export const requireOwnerMerchant = cache(async () => {
  const found = await requireMerchant();
  if (found.role !== "OWNER") redirect("/m");
  return found;
});
