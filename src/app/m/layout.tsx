import { cookies } from "next/headers";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants, merchantUsers, rewards } from "@/db/schema";
import { memberMerchant, requireUser } from "@/lib/dal";
import { getEnv } from "@/lib/env";
import { AppShell } from "@/components/shell/app-shell";
export default async function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser(),
    selected = (await cookies()).get("kickback.merchant")?.value,
    found =
      (await memberMerchant(user.id, selected, ["OWNER", "VIEWER"])) ??
      (await memberMerchant(user.id, undefined, ["OWNER", "VIEWER"])),
    current = found?.merchant;
  const [businesses, [review]] = await Promise.all([
    getDb()
      .select({ id: merchants.id, name: merchants.displayName })
      .from(merchantUsers)
      .innerJoin(merchants, eq(merchants.id, merchantUsers.merchantId))
      .where(
        and(
          eq(merchantUsers.userId, user.id),
          inArray(merchantUsers.role, ["OWNER", "VIEWER"]),
        ),
      )
      .orderBy(merchants.createdAt, merchants.slug),
    current
      ? getDb()
          .select({ count: sql<number>`count(*)::int` })
          .from(rewards)
          .where(
            and(eq(rewards.merchantId, current.id), eq(rewards.state, "HELD")),
          )
      : Promise.resolve([{ count: 0 }]),
  ]);
  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      businesses={businesses}
      current={
        current
          ? { id: current.id, name: current.displayName, slug: current.slug }
          : undefined
      }
      sandbox={getEnv().KICKBACK_ENV === "sandbox"}
      reviewCount={review?.count ?? 0}
      readOnly={found?.role === "VIEWER"}
    >
      {children}
    </AppShell>
  );
}
