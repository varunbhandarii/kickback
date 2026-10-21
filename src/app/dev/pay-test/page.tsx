export const metadata = { title: "Sandbox checkout" };
import { notFound } from "next/navigation";
import { publicSandboxTools, getEnv } from "@/lib/env";
import { merchantContext, merchantName } from "@/lib/paypal/merchants";
import PayTest from "./pay-test";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!publicSandboxTools()) notFound();
  const params = await searchParams;
  const name = merchantName.safeParse(params.merchant ?? "platform");
  if (!name.success) notFound();
  const env = getEnv();
  const ctx = await merchantContext(name.data);
  return (
    <PayTest
      merchant={name.data}
      clientId={ctx.clientId}
      bnCode={env.PAYPAL_BN_CODE as string | undefined}
    />
  );
}
