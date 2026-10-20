export const metadata = { title: "Connect PayPal" };
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections } from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
import ConnectForms from "./connect-forms";
import ConnectionStatus from "./connection-status";
import { Icon } from "@/components/icons";
export default async function Connect() {
  const { merchant } = await requireMerchant(),
    [connection] = await getDb()
      .select()
      .from(connections)
      .where(eq(connections.merchantId, merchant.id));
  const status = connection?.status ?? "NOT_CONNECTED";
  return (
    <div className="setup-grid">
      <div className="setup-main">
        <div className="flex flex-col gap-1.5">
          <h1 className="page-title">Connect your PayPal business account</h1>
          <p className="page-sub" style={{ fontSize: 15 }}>
            You approve access on PayPal&apos;s site and come straight back. Rewards are paid from this account, so
            nothing works until it is connected.
          </p>
        </div>
        {status !== "NOT_CONNECTED" && (
          <div className="card card-pad flex flex-col gap-4">
            <ConnectionStatus
              merchantId={merchant.id}
              name={merchant.displayName}
              status={status}
              mode={connection?.mode ?? "PARTNER"}
            />
            {status === "CONNECTED" && (
              <Link className="btn btn-primary self-start" href="/m/onboarding/history">
                Continue to your history
                <Icon name="arrowRight" size={16} />
              </Link>
            )}
          </div>
        )}
        <ConnectForms merchantId={merchant.id} name={merchant.displayName} />
      </div>
      <aside className="setup-aside">
        <div className="card card-pad flex flex-col gap-3">
          <h2 className="card-title">What happens next</h2>
          <ol className="flex flex-col gap-3" style={{ fontSize: 14, lineHeight: 1.5 }}>
            {[
              "You approve on PayPal and land back here.",
              "We confirm with PayPal that payments and refunds are enabled.",
              "We read your recent sales so your regulars keep the visits they already have.",
            ].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="flex flex-none items-center justify-center rounded-full" style={{ width: 26, height: 26, background: "var(--forest-tint)", color: "var(--forest)", fontWeight: 700, fontSize: 13 }}>
                  {i + 1}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="card card-tint card-pad flex flex-col gap-1.5">
          <h2 className="card-title flex items-center gap-2">
            <Icon name="shield" size={18} style={{ color: "var(--forest)" }} />
            You stay in control
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.55 }}>
            Pause rewards with one switch. Disconnect anytime and customer and payment data is scheduled for deletion
            within 48 hours.
          </p>
        </div>
      </aside>
    </div>
  );
}
