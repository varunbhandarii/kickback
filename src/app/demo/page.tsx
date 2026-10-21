export const metadata = {
  title: "Try the demo",
  description: "Watch a sandbox reward happen, pay as a customer, or explore the merchant app read-only.",
};
import Link from "next/link";
import { cookies } from "next/headers";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Icon } from "@/components/icons";
import { getEnv } from "@/lib/env";
import { DEMO_COOKIE } from "@/lib/demo/accounts";
import { heldBuyer, publishedCredentials } from "@/lib/demo/buyers";
import { demoPaymentsUnavailable, lastGoodRun, watchUnavailable } from "@/lib/demo/runs";
import type { BuyerState } from "./actions";
import { ExploreCard, PayCard, WatchCard } from "./demo-cards";
export const dynamic = "force-dynamic";
const REPO = "https://github.com/varunbhandarii/kickback";
export default async function DemoPage() {
  const sandbox = getEnv().KICKBACK_ENV === "sandbox";
  const holder = (await cookies()).get(DEMO_COOKIE)?.value;
  const held = holder ? await heldBuyer("pay:" + holder) : undefined,
    password = held && publishedCredentials().get(held.email);
  const initial: BuyerState =
    held && password
      ? { buyer: { email: held.email, password, until: held.reservedUntil!.toISOString() } }
      : {};
  const unavailable = sandbox ? await watchUnavailable() : "The live demo runs only in PayPal sandbox.",
    payClosed = sandbox ? await demoPaymentsUnavailable() : unavailable;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1" style={{ paddingBlock: "56px 72px" }}>
        <div className="site-section-inner flex flex-col gap-10">
          <div className="flex flex-col gap-3" style={{ maxWidth: 680 }}>
            <span className="eyebrow" style={{ color: "var(--forest)" }}>
              Demo
            </span>
            <h1 className="hero-title" style={{ fontSize: "clamp(36px, 5vw, 56px)" }}>
              Try Kickback
            </h1>
            <p className="text-ink-2" style={{ fontSize: 18, lineHeight: 1.55 }}>
              Three ways to see a payment become a punch card and a reward. Everything runs in PayPal sandbox, so no
              real money moves.
            </p>
          </div>
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
            <WatchCard unavailable={unavailable} lastRunId={unavailable ? await lastGoodRun() : undefined} />
            <PayCard
              initial={initial}
              closed={payClosed}
              venmoNote="Venmo is a US wallet. On a phone with the Venmo app it opens the app; on desktop it opens a web login. If Venmo doesn't work where you are, use PayPal."
            />
            <ExploreCard />
          </div>
          <nav aria-label="More ways to look" className="flex flex-wrap gap-x-8 gap-y-3" style={{ fontSize: 15 }}>
            <a href={`${REPO}/blob/main/docs/setup.md#bring-your-own-sandbox-business`} className="flex items-center gap-1.5">
              Connect your own sandbox business
              <Icon name="external" size={14} />
            </a>
            <a href={`${REPO}#run-locally`} className="flex items-center gap-1.5">
              Run it locally
              <Icon name="external" size={14} />
            </a>
            <a href={`${REPO}/blob/main/docs/demo-accounts.md`} className="flex items-center gap-1.5">
              Demo accounts and how they stay ready
              <Icon name="external" size={14} />
            </a>
            <Link href="/status">Service status</Link>
          </nav>
          <p className="caption" style={{ fontSize: 14 }}>
            Kickback runs in PayPal sandbox. No real money moves. Demo customers are kept at 4 of 5 visits with
            recorded sandbox purchases on earlier days, so your payment is the fifth.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
