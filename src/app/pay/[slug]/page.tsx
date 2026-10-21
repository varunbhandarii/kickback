import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { DEMO_COOKIE } from "@/lib/demo/accounts";
import { loadMerchant, connectionContext } from "@/lib/merchants";
import { getEnv } from "@/lib/env";
import PayClient from "./pay-client";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections } from "@/db/schema";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const m = await loadMerchant((await params).slug);
  return { title: m ? `Pay ${m.displayName}` : "Pay" };
}
export default async function PayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params,
    merchant = await loadMerchant(slug);
  if (!merchant) notFound();
  const env = getEnv(),
    [connection] = await getDb()
      .select({ status: connections.status })
      .from(connections)
      .where(eq(connections.merchantId, merchant.id));
  const paused =
    merchant.status !== "ACTIVE" ||
    Boolean(merchant.purgeAfter) ||
    connection?.status !== "CONNECTED";
  const ctx = paused ? undefined : await connectionContext(merchant.id);
  return (
    <PayClient
      slug={slug}
      name={merchant.displayName}
      menu={merchant.menu}
      spec={merchant.spec}
      paused={paused}
      clientId={ctx?.clientId ?? ""}
      bnCode={env.PAYPAL_BN_CODE as string | undefined}
      sandbox={env.KICKBACK_ENV === "sandbox"}
      demoReturn={
        env.KICKBACK_ENV === "sandbox" && (await cookies()).has(DEMO_COOKIE)
      }
    />
  );
}
