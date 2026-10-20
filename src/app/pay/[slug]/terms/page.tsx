export const metadata = { title: "Program terms" };
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadMerchant } from "@/lib/merchants";
import { getEnv } from "@/lib/env";
import { Endorsement } from "@/components/brand";
import { Icon } from "@/components/icons";
import { minutesInWords, moneyShort, ordinal } from "@/lib/format";
export const dynamic = "force-dynamic";
const money = (n: number) => `$${(n / 100).toFixed(2)}`;
export default async function ProgramTerms({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params,
    merchant = await loadMerchant(slug);
  if (!merchant) notFound();
  const s = merchant.spec;
  const sandbox = getEnv().KICKBACK_ENV === "sandbox";
  const short = [
    s.type === "VISIT_MILESTONE"
      ? `Every ${ordinal(s.n)} qualifying visit within ${s.windowDays} days earns ${moneyShort(s.rewardCents)} back.`
      : `Every ${money(s.spendCents)} in qualifying purchases within ${s.windowDays} days earns ${moneyShort(s.rewardCents)} back.`,
    "Rewards are partial refunds to the PayPal or Venmo account you paid with.",
    "No sign-up. Pay another way to opt out.",
  ];
  return (
    <main className="customer">
      <header className="band">
        <div className="band-inner" style={{ paddingBottom: 28, maxWidth: 760 }}>
          <div className="band-row">
            <Link href={`/pay/${slug}`} className="inline-flex items-center gap-1.5" style={{ color: "var(--on-band-2)", fontWeight: 600, fontSize: 14 }}>
              <Icon name="arrowLeft" size={16} />
              {merchant.displayName}
            </Link>
            {sandbox && <span className="band-chip">Sandbox demo</span>}
          </div>
          <h1 className="band-title">{merchant.displayName} rewards terms</h1>
        </div>
      </header>
      <div className="policy" style={{ paddingTop: 28 }}>
        {sandbox && (
          <p className="banner banner-info">Sandbox demonstration: test balances only.</p>
        )}
        {s.termsIntro && <p style={{ fontSize: 17 }}>{s.termsIntro}</p>}
        <section className="card summary-card" aria-labelledby="short-title">
          <h2 id="short-title" style={{ marginTop: 0, fontSize: 16 }}>
            The short version
          </h2>
          <ul>
            {short.map((line) => (
              <li key={line}>
                <Icon name="check" size={18} strokeWidth={2.5} style={{ color: "var(--forest)", flex: "none", marginTop: 3 }} />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <h2>How visits count</h2>
        <p>
          Earn {money(s.rewardCents)} back after{" "}
          {s.type === "VISIT_MILESTONE"
            ? `${s.n} qualifying visits`
            : `${money(s.spendCents)} in qualifying purchases`}{" "}
          within {s.windowDays} calendar days in {merchant.tz}.
        </p>
        <p>
          A qualifying purchase is a completed USD payment of at least{" "}
          {money(s.minTicketCents)} through this page using PayPal or Venmo.
          Purchases within {minutesInWords(s.mergeWindowMin)} count as one visit. A
          milestone starts a new cycle; extra spend does not carry over.
        </p>
        {s.type === "VISIT_MILESTONE" && !!s.endowedProgress && (
          <p>
            The first cycle starts with {s.endowedProgress} visits of
            introductory progress. Later cycles start from zero.
          </p>
        )}

        <h2>How rewards are paid</h2>
        <p>
          Rewards are paid as a partial refund of an eligible purchase, normally
          shortly after payment. Pending payments must complete first.
          Processing delays or an unavailable refund may require a later
          purchase or merchant review.
        </p>

        <h2>Limits</h2>
        <p>
          Rewards are limited to {money(s.perCustomerMonthlyCapCents)} per
          customer per calendar month, with a merchant budget of{" "}
          {money(s.dailyBudgetCents)} per day and {money(s.monthlyBudgetCents)}{" "}
          per month. Milestones reached after a limit is exhausted do not earn a
          later reward.
        </p>

        {s.winBack && (
          <>
            <h2>Welcome-back reward</h2>
            <p>
              After at least {s.winBack.minVisits} earlier qualifying visits, a
              qualifying return visit following a gap of at least{" "}
              {s.winBack.gapDays} calendar days can earn{" "}
              {money(s.winBack.rewardCents)} back. Limited to once per customer
              per 180 calendar days. A regular milestone takes precedence on the
              same visit. The same budgets, caps and eligibility rules apply;
              imported past visits never trigger a retroactive welcome-back
              refund.
            </p>
          </>
        )}

        <h2>Returns and disputes</h2>
        <p>
          Returned or disputed purchases may forfeit eligibility. Rewards
          already paid for a returned purchase may offset a future reward.
          Rewards pause while a dispute is reviewed. Taxes and the price of the
          original purchase are unchanged; payment-service fees follow the
          provider’s rules.
        </p>

        <section className="callout" aria-labelledby="why-refund">
          <h2 id="why-refund">Why did I get a refund?</h2>
          <p style={{ marginTop: 8 }}>
            A small partial refund can be your earned loyalty reward from{" "}
            {merchant.displayName}. It is a loyalty reward, not an error and not a
            return. You do not need to buy anything extra or take action to
            receive it. We do not adjust sales tax or fees on the original
            purchase. Contact the merchant if you do not recognize it.
          </p>
        </section>

        {!!s.workedExamples?.length && (
          <>
            <h2>Examples</h2>
            {s.workedExamples.map((example, i) => (
              <p key={i}>{example}</p>
            ))}
          </>
        )}

        <h2>Contact and opt out</h2>
        <p>
          Participation does not require a separate account. To opt out, pay
          another way through the merchant. Contact {merchant.displayName} about
          an eligibility or refund issue. PayPal’s terms also apply to payment
          services.
        </p>

        <footer className="customer-foot" style={{ marginTop: 12 }}>
          <nav aria-label="More information">
            <Link href={`/pay/${slug}`}>Pay at {merchant.displayName}</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
          <Endorsement withIcon />
        </footer>
      </div>
    </main>
  );
}
