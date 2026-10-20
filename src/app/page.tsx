export const metadata = {
  title: { absolute: "Kickback · Loyalty that pays customers back" },
};
import Link from "next/link";
import { BrandLink, Wordmark } from "@/components/brand";
import { Icon, type IconName } from "@/components/icons";
import { PunchRow } from "@/components/ui";

const steps = [
  {
    mark: "1",
    title: "They scan and pay",
    body: "The QR on your counter sign opens your pay page. Customers pick what they're having and pay with PayPal or Venmo, the way they already do.",
  },
  {
    mark: "2",
    title: "Visits add up on their own",
    body: "Kickback recognizes a returning wallet with a one-way code that only works for your shop. No names, emails or phone numbers are kept.",
  },
  {
    mark: "$2",
    title: "Their 5th visit pays them back",
    body: "A few dollars go back to the wallet they paid with, as a partial refund of that purchase, with a thank-you note in your voice.",
  },
];

const features: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "cockpit",
    title: "Designed from your own sales",
    body: "AI proposes three programs from your PayPal history. Every cost and reach number comes from a backtest you can check.",
  },
  {
    icon: "shield",
    title: "Rewards that check themselves",
    body: "Unusual patterns, like split purchases or a burst of visits, are held for your approval. Everyone else is paid automatically.",
  },
  {
    icon: "chat",
    title: "A cockpit that answers questions",
    body: "See who's coming back and who's close to a reward. Ask the analyst in plain words. It reads your data and can't move money.",
  },
  {
    icon: "pause",
    title: "Your budget, your switch",
    body: "Daily and monthly limits, a pause button, and a clean disconnect that schedules customer and payment data for deletion within 48 hours.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="site-head">
        <div className="site-head-inner">
          <BrandLink size={24} withIcon />
          <nav aria-label="Main" className="site-nav">
            <a href="#how">How it works</a>
            <a href="#merchants">For merchants</a>
            <a href="#demo">Try the demo</a>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link href="/sign-in" className="btn btn-ghost">
              Sign in
            </Link>
            <Link href="/sign-up" className="btn btn-primary">
              Connect your business
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="site-section-inner flex flex-wrap items-center gap-14" style={{ paddingBlock: "72px 80px" }}>
          <div className="flex min-w-0 flex-col gap-6" style={{ flex: "1 1 480px" }}>
            <span className="eyebrow" style={{ color: "var(--forest)", fontSize: 13 }}>
              For cafes, bakeries and salons that take PayPal and Venmo
            </span>
            <h1 className="hero-title">A little thank-you for coming back.</h1>
            <p className="text-ink-2" style={{ fontSize: 19, lineHeight: 1.55, maxWidth: 560 }}>
              Your regulars already pay with PayPal or Venmo. Kickback counts their visits and sends a few
              dollars back to their wallet when they reach your milestone. No app, no plastic cards, no sign-up
              at the counter.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/sign-up" className="btn btn-primary btn-lg">
                Connect your business
              </Link>
              <Link href="/pay/rosas" className="btn btn-secondary btn-lg">
                Try the demo cafe
                <Icon name="arrowRight" size={16} />
              </Link>
            </div>
            <p className="caption" style={{ fontSize: 14 }}>
              Free while Kickback runs in PayPal sandbox. No contract, no hardware, no customer app. Pricing for
              live merchants will be announced before launch.
            </p>
          </div>

          <figure className="relative flex min-w-0 items-center justify-center" style={{ flex: "1 1 420px", minHeight: 520 }}>
            <figcaption className="sr-only">
              Example: a customer&apos;s card at visit 4 of 5, and the $2.00 refund that arrives after visit 5.
            </figcaption>
            <div aria-hidden="true" className="contents">
              <div className="absolute" style={{ inset: "24px 8% 24px 18%", borderRadius: 32, background: "var(--forest-tint)" }} />
              <div
                className="relative overflow-hidden"
                style={{ width: 300, borderRadius: 28, background: "var(--surface)", border: "1px solid var(--line)", boxShadow: "var(--shadow-pop)" }}
              >
                <div className="band flex flex-col gap-1" style={{ padding: "18px 18px 52px" }}>
                  <span className="band-sub" style={{ fontSize: 11, fontWeight: 600 }}>
                    Paid $5.50 with PayPal
                  </span>
                  <span className="display" style={{ fontStretch: "125%", fontWeight: 800, fontSize: 22 }}>
                    Rosa&apos;s Cafe
                  </span>
                </div>
                <div
                  className="card flex flex-col gap-2.5"
                  style={{ margin: "-38px 14px 18px", padding: "14px 14px 16px", position: "relative" }}
                >
                  <span className="display num" style={{ fontStretch: "125%", fontWeight: 800, fontSize: 26 }}>
                    Visit 4 of 5
                  </span>
                  <PunchRow target={5} filled={4} rewardCents={200} size="md" newest spread />
                  <span className="text-ink-2" style={{ fontSize: 13 }}>
                    1 more visit and $2 comes back to you.
                  </span>
                </div>
                <div className="flex flex-col gap-2" style={{ padding: "0 14px 18px" }}>
                  <div
                    className="flex items-center justify-center"
                    style={{ height: 38, borderRadius: 10, background: "var(--forest)", color: "var(--on-forest)", fontSize: 13, fontWeight: 600 }}
                  >
                    Keep your card on this phone
                  </div>
                  <div style={{ height: 10, width: "70%", borderRadius: 6, background: "var(--surface-2)" }} />
                  <div style={{ height: 10, width: "50%", borderRadius: 6, background: "var(--surface-2)" }} />
                </div>
              </div>
              <div
                className="absolute flex flex-col gap-1.5"
                style={{
                  right: 0,
                  bottom: 40,
                  width: 270,
                  borderRadius: 16,
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  boxShadow: "var(--shadow-pop)",
                  padding: "14px 16px",
                  transform: "rotate(2deg)",
                }}
              >
                <span className="eyebrow" style={{ fontSize: 11 }}>
                  After visit 5
                </span>
                <div className="flex items-baseline justify-between gap-3">
                  <span style={{ fontSize: 15, fontWeight: 600 }}>Refund from Rosa&apos;s Cafe</span>
                  <span className="display num" style={{ fontStretch: "112%", fontWeight: 700, fontSize: 18, color: "var(--forest)" }}>
                    +$2.00
                  </span>
                </div>
                <span className="text-ink-2" style={{ fontSize: 13, lineHeight: 1.45 }}>
                  &ldquo;Thanks for 5 visits. Here is a $2 loyalty reward from Rosa&apos;s Cafe.&rdquo;
                </span>
              </div>
            </div>
          </figure>
        </section>

        <section id="how" aria-labelledby="how-title" className="border-y border-line bg-surface" style={{ paddingBlock: 72 }}>
          <div className="site-section-inner flex flex-col gap-10">
            <div className="flex flex-col gap-2.5" style={{ maxWidth: 640 }}>
              <span className="eyebrow">How it works</span>
              <h2 id="how-title" className="section-heading">
                The payment is the punch card.
              </h2>
            </div>
            <ol className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              {steps.map((step, i) => (
                <li key={step.title} className="flex flex-col gap-3.5 rounded-2xl border border-line bg-paper" style={{ padding: 24 }}>
                  <span
                    aria-hidden="true"
                    className="display flex items-center justify-center rounded-full"
                    style={{
                      width: 44,
                      height: 44,
                      fontStretch: "112%",
                      fontWeight: 800,
                      fontSize: i === 2 ? 15 : 18,
                      ...(i === 0
                        ? { border: "2px solid var(--forest)", color: "var(--forest)" }
                        : i === 1
                          ? { background: "var(--forest)", color: "var(--on-forest)" }
                          : { background: "var(--mint)", color: "var(--on-mint)" }),
                    }}
                  >
                    {step.mark}
                  </span>
                  <h3 style={{ fontSize: 19, fontWeight: 600 }}>{step.title}</h3>
                  <p className="text-ink-2" style={{ fontSize: 15, lineHeight: 1.6 }}>
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="merchants" aria-labelledby="merchants-title" style={{ paddingBlock: 80 }}>
          <div className="site-section-inner grid items-start gap-12" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
            <div className="flex flex-col gap-3.5">
              <span className="eyebrow">For merchants</span>
              <h2 id="merchants-title" className="section-heading">
                A loyalty program you can set up between orders.
              </h2>
              <p className="text-ink-2" style={{ fontSize: 16, lineHeight: 1.6 }}>
                Connect PayPal, tell Kickback your goal and budget, approve one of three designs, print the sign.
                Rewards come from your own PayPal account, inside limits you set.
              </p>
            </div>
            <div className="grid gap-x-8 gap-y-7" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}>
              {features.map((f) => (
                <div key={f.title} className="flex flex-col gap-2">
                  <span
                    className="flex items-center justify-center"
                    style={{ width: 36, height: 36, borderRadius: 10, background: "var(--forest-tint)", color: "var(--forest)" }}
                  >
                    <Icon name={f.icon} size={18} />
                  </span>
                  <h3 style={{ fontSize: 17, fontWeight: 600 }}>{f.title}</h3>
                  <p className="text-ink-2" style={{ fontSize: 15, lineHeight: 1.6 }}>
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" aria-labelledby="demo-title" style={{ paddingBottom: 80 }}>
          <div className="site-section-inner">
            <div
              className="band flex flex-wrap items-center justify-between gap-10"
              style={{ borderRadius: 24, padding: "48px clamp(24px, 5vw, 56px)" }}
            >
              <div className="flex min-w-0 flex-col gap-3.5" style={{ flex: "1 1 420px" }}>
                <h2 id="demo-title" className="display" style={{ fontStretch: "125%", fontWeight: 800, fontSize: "clamp(28px, 3.6vw, 44px)", lineHeight: 1.02 }}>
                  Try Rosa&apos;s Cafe in two minutes.
                </h2>
                <p className="band-sub" style={{ fontSize: 16, lineHeight: 1.6 }}>
                  Pay with a PayPal sandbox buyer account, watch your card fill, and see the $2 refund arrive on the
                  fifth visit. Test balances only.
                </p>
              </div>
              <Link href="/pay/rosas" className="btn btn-on-band btn-lg flex-none">
                Visit Rosa&apos;s Cafe
                <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface" style={{ paddingBlock: "32px 40px" }}>
        <div className="site-section-inner flex flex-wrap items-center justify-between gap-x-10 gap-y-4">
          <Wordmark size={20} />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2" style={{ fontSize: 14 }}>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/ai">How Kickback uses AI</Link>
            <a href="/api/health">Service status</a>
          </nav>
          <p className="caption basis-full" style={{ fontSize: 13 }}>
            Kickback runs in PayPal sandbox today and has not processed live money. PayPal and Venmo are trademarks
            of PayPal, Inc.
          </p>
        </div>
      </footer>
    </div>
  );
}
