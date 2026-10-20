import Link from "next/link";
import { merchantFaq } from "@/lib/merchant-faq";
import { PageHeader } from "@/components/ui";
import { SummaryCard } from "@/components/policy-layout";
export const metadata = { title: "Rewards, reports and taxes" };
const ids = ["cost", "reports", "taxes", "limits", "disputes", "data"];
export default function MerchantHelp() {
  return (
    <>
      <PageHeader title="Rewards, reports and taxes" sub="How rewards show up in your PayPal records and what to tell your accountant." />
      <div className="policy" style={{ margin: 0, padding: 0, maxWidth: 760 }}>
        <SummaryCard
          lines={[
            "Each reward is a partial refund linked to its original sale in PayPal.",
            "The annual rewards CSV lists every reward so you can reconcile it with PayPal reports.",
            "Kickback does not change collected sales tax. Ask your accountant how to book rewards.",
          ]}
        />
        <nav aria-label="Questions" className="flex flex-wrap gap-x-5 gap-y-2" style={{ fontSize: 14 }}>
          {merchantFaq.map(([q], i) => (
            <a key={q} href={`#${ids[i] ?? `q${i}`}`}>
              {q}
            </a>
          ))}
        </nav>
        {merchantFaq.map(([q, a], i) => (
          <section key={q} id={ids[i] ?? `q${i}`} aria-labelledby={`${ids[i] ?? `q${i}`}-title`} style={{ scrollMarginTop: 24 }}>
            <h2 id={`${ids[i] ?? `q${i}`}-title`}>{q}</h2>
            <p style={{ marginTop: 8 }}>{a}</p>
          </section>
        ))}
        <section id="csv" aria-labelledby="csv-title">
          <h2 id="csv-title">The rewards CSV</h2>
          <p style={{ marginTop: 8 }}>
            The CSV uses reward creation year and merchant-local dates, includes all reward states and is capped at
            50,000 rows. Reconcile sent_at and net_cents against PayPal; held and cancelled rows are not money sent.
            Export your records before disconnecting and purging.
          </p>
          <p style={{ marginTop: 8 }}>
            <Link href="/m/rewards">Open Rewards to export the CSV</Link>
          </p>
        </section>
        <p className="caption" style={{ fontSize: 14 }}>
          References: <a href="https://www.irs.gov/instructions/i1099k">IRS Form 1099-K</a> ·{" "}
          <a href="https://www.paypal.com/us/business/paypal-business-fees">PayPal refund fees</a> ·{" "}
          <Link href="/privacy">Privacy</Link>
        </p>
      </div>
    </>
  );
}
