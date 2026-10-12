import { notFound } from "next/navigation";
import { loadMerchant, connectionContext } from "@/lib/merchants";
import { getEnv } from "@/lib/env";
import PayClient from "./pay-client";
export const dynamic = "force-dynamic";
export default async function PayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params, merchant = await loadMerchant(slug);
  if (!merchant) notFound();
  const ctx = await connectionContext(merchant.id), env = getEnv();
  return <PayClient slug={slug} name={merchant.displayName} menu={merchant.menu} spec={merchant.spec} paused={merchant.status !== "ACTIVE"} clientId={ctx.clientId} bnCode={env.PAYPAL_BN_CODE as string | undefined} sandbox={env.KICKBACK_ENV === "sandbox"} />;
}
