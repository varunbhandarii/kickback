import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants, merchantUsers } from "@/db/schema";
import { auth } from "./auth";
import { enforceSessionAge } from "./session-policy";
export const getSession = cache(async () => {
  const result = await auth.api.getSession({ headers: await headers() });
  return enforceSessionAge(result);
});
export const requireUser = cache(async () => {
  const result = await getSession();
  if (!result) redirect("/sign-in");
  return result.user;
});
export async function ownedMerchant(userId: string, id?: string) {
  if (
    id &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return undefined;
  const rows = await getDb()
    .select({ merchant: merchants })
    .from(merchantUsers)
    .innerJoin(merchants, eq(merchants.id, merchantUsers.merchantId))
    .where(
      and(
        eq(merchantUsers.userId, userId),
        eq(merchantUsers.role, "OWNER"),
        ...(id ? [eq(merchantUsers.merchantId, id)] : []),
      ),
    )
    .orderBy(merchants.createdAt, merchants.slug);
  return rows[0]?.merchant;
}
export const requireMerchant = cache(async () => {
  const user = await requireUser(),
    selected = (await cookies()).get("kickback.merchant")?.value;
  const merchant =
    (await ownedMerchant(user.id, selected)) ?? (await ownedMerchant(user.id));
  if (!merchant) redirect("/m/onboarding/business");
  return { user, merchant };
});
