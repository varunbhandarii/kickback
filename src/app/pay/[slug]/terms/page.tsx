export const metadata = { title: "Program terms" };
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadMerchant } from "@/lib/merchants";
import { getEnv } from "@/lib/env";
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
  return (
    <main className="pay-shell">
      <Link href={`/pay/${slug}`}>← {merchant.displayName}</Link>
      <h1 className="mt-6 text-3xl font-bold">Program terms</h1>
      {getEnv().KICKBACK_ENV === "sandbox" && (
        <p className="my-4 font-semibold">
          Sandbox demonstration: test balances only.
        </p>
      )}
      <div className="terms-copy">
        <h2 id="why-refund">Why did I get a refund?</h2>
        <p>
          A small partial refund can be your earned loyalty reward from{" "}
          {merchant.displayName}. It is a loyalty reward, not an error and not a
          return. You do not need to buy anything extra or take action to
          receive it. We do not adjust sales tax or fees on the original
          purchase. Contact the merchant if you do not recognize it.
        </p>
        {s.winBack && (
          <p>
            Welcome-back reward: after at least {s.winBack.minVisits} earlier
            qualifying visits, a qualifying return visit following a gap of at
            least {s.winBack.gapDays} calendar days can earn{" "}
            {money(s.winBack.rewardCents)} back. Limited to once per customer
            per 180 calendar days. A regular milestone takes precedence on the
            same visit. The same budgets, caps and eligibility rules apply;
            imported past visits never trigger a retroactive welcome-back
            refund.
          </p>
        )}
        {s.termsIntro && <p>{s.termsIntro}</p>}
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
          Purchases within {s.mergeWindowMin} minutes count as one visit. A
          milestone starts a new cycle; extra spend does not carry over.
        </p>
        <p>
          Rewards are paid as a partial refund of an eligible purchase, normally
          shortly after payment. Pending payments must complete first.
          Processing delays or an unavailable refund may require a later
          purchase or merchant review.
        </p>
        <p>
          Rewards are limited to {money(s.perCustomerMonthlyCapCents)} per
          customer per calendar month, with a merchant budget of{" "}
          {money(s.dailyBudgetCents)} per day and {money(s.monthlyBudgetCents)}{" "}
          per month. Milestones reached after a limit is exhausted do not earn a
          later reward.
        </p>
        <p>
          Returned or disputed purchases may forfeit eligibility. Rewards
          already paid for a returned purchase may offset a future reward.
          Rewards pause while a dispute is reviewed. Taxes and the price of the
          original purchase are unchanged; payment-service fees follow the
          provider’s rules.
        </p>
        <p>
          Participation does not require a separate account. To opt out, pay
          another way through the merchant. Contact {merchant.displayName} about
          an eligibility or refund issue. PayPal’s terms also apply to payment
          services.
        </p>
        {s.workedExamples?.map((example, i) => (
          <p key={i}>{example}</p>
        ))}
        {s.type === "VISIT_MILESTONE" && !!s.endowedProgress && (
          <p>
            The first cycle starts with {s.endowedProgress} visits of
            introductory progress. Later cycles start from zero.
          </p>
        )}
      </div>
    </main>
  );
}
