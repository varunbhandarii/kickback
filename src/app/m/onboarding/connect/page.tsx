export const metadata = { title: "Connect PayPal" };
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections } from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
import ConnectForms from "./connect-forms";
import ConnectionStatus from "./connection-status";
export default async function Connect() {
  const { merchant } = await requireMerchant(),
    [connection] = await getDb()
      .select()
      .from(connections)
      .where(eq(connections.merchantId, merchant.id));
  return (
    <>
      <ConnectionStatus
        merchantId={merchant.id}
        status={connection?.status ?? "NOT_CONNECTED"}
        mode={connection?.mode ?? "PARTNER"}
      />
      {connection?.status === "CONNECTED" && (
        <p className="merchant-next">
          <Link className="merchant-primary" href="/m/onboarding/history">
            Continue to your history →
          </Link>
        </p>
      )}
      <ConnectForms merchantId={merchant.id} />
    </>
  );
}
