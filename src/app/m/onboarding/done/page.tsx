export const metadata = { title: "You're live" };
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections } from "@/db/schema";
import { requireOwnerMerchant } from "@/lib/dal";
import { loadMerchant } from "@/lib/merchants";
import { getEnv } from "@/lib/env";
import { programHeadline } from "@/lib/format";
import { Icon } from "@/components/icons";
import { SignSheet } from "@/app/pay/[slug]/sign/sign-sheet";
import { SignActions } from "../menu/menu-form";
export default async function SetupDone() {
  const { merchant } = await requireOwnerMerchant(),
    loaded = await loadMerchant(merchant.slug, true),
    env = getEnv(),
    url = new URL(`/pay/${merchant.slug}`, env.APP_URL).href;
  const [connection] = await getDb()
    .select({ status: connections.status })
    .from(connections)
    .where(eq(connections.merchantId, merchant.id));
  const live =
    merchant.status === "ACTIVE" &&
    connection?.status === "CONNECTED" &&
    loaded?.program.status === "ACTIVE";
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span
          className="flex items-center justify-center"
          style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--forest)", color: "var(--on-forest)" }}
          aria-hidden="true"
        >
          <Icon name="check" size={22} strokeWidth={3} />
        </span>
        <h1 className="page-title">
          {live ? `${merchant.displayName} is live` : `${merchant.displayName} is almost ready`}
        </h1>
        <p className="page-sub" style={{ fontSize: 15 }}>
          {live && loaded
            ? `${programHeadline(loaded.spec)}. Put the sign on your counter; every PayPal or Venmo payment on your pay page now counts as a visit.`
            : "Finish connecting PayPal and activating a program, then your pay page starts counting visits."}
        </p>
      </div>
      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
        {loaded && (
          <div style={{ width: "100%", maxWidth: 300 }}>
            <SignSheet name={merchant.displayName} spec={loaded.spec} url={url} sandbox={env.KICKBACK_ENV === "sandbox"} thumbnail />
          </div>
        )}
        <section className="card card-pad flex flex-col gap-4" aria-labelledby="next-title">
          <h2 id="next-title" className="card-title">
            Next
          </h2>
          <SignActions merchantId={merchant.id} slug={merchant.slug} />
          <Link href="/m" className="btn btn-primary">
            Go to your overview
            <Icon name="arrowRight" size={16} />
          </Link>
        </section>
      </div>
    </div>
  );
}
