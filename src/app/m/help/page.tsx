import Link from "next/link";
import { merchantFaq } from "@/lib/merchant-faq";
export const metadata = { title: "Reports and rewards help" };
export default function MerchantHelp() {
  return (
    <>
      <h1>Reports and rewards help</h1>
      {merchantFaq.map(([q, a]) => (
        <section className="merchant-card" key={q}>
          <h2>{q}</h2>
          <p>{a}</p>
        </section>
      ))}
      <p>
        The CSV uses reward creation year and merchant-local dates, includes all
        reward states and is capped at 50,000 rows. Reconcile sent_at and
        net_cents against PayPal; held and cancelled rows are not money sent.
        Export your records before disconnecting and purging.
      </p>
      <p>
        References:{" "}
        <a href="https://www.irs.gov/instructions/i1099k">IRS Form 1099-K</a> ·{" "}
        <a href="https://www.paypal.com/us/business/paypal-business-fees">
          PayPal refund fees
        </a>
      </p>
      <Link href="/m/rewards">Rewards and annual CSV</Link> ·{" "}
      <Link href="/privacy">Privacy</Link>
    </>
  );
}
