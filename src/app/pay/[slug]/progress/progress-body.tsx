import Link from "next/link";
import type { readProgress } from "@/lib/payments/progress";
import { Endorsement } from "@/components/brand";
import { Icon } from "@/components/icons";
import { PunchRow, SpendBar, State } from "@/components/ui";
import { day, money, moneyShort } from "@/lib/format";

type ProgressData = Awaited<ReturnType<typeof readProgress>>;
type CardData = Extract<ProgressData, { name: string }>;

export function ProgressBody({
  data,
  slug,
  sandbox = false,
}: {
  data: ProgressData;
  slug: string;
  sandbox?: boolean;
}) {
  if (data.error)
    return (
      <main className="customer">
        <div className="customer-col" style={{ marginTop: 0, paddingTop: 32 }}>
          <Endorsement withIcon />
          <div className="card">
            <State
              icon={data.error.includes("ended") ? "clock" : "link"}
              title={data.error.includes("ended") ? "This card has ended" : "This card link doesn't work"}
            >
              <p>
                {data.error.includes("ended")
                  ? "The shop has ended this rewards program. Thanks for being a regular."
                  : data.error.includes("try again")
                    ? "Too many checks in a short time. Please try again in a minute."
                    : "The link has expired or was changed. Paying at the shop again gives you a new one."}
              </p>
            </State>
          </div>
        </div>
      </main>
    );
  const card = data as CardData;
  const p = card.progress;
  const visit = p?.type !== "SPEND_MILESTONE";
  const remaining = p ? Math.max(0, p.target - p.current) : 0;
  return (
    <main className="customer">
      <div className="customer-col" style={{ marginTop: 0, paddingTop: 24 }}>
        <div className="flex items-center justify-between gap-3" style={{ padding: "0 4px" }}>
          <span className="muted">
            <Endorsement withIcon />
          </span>
          {sandbox && <span className="chip chip-demo chip-sm">Sandbox demo</span>}
        </div>

        <article className="ticket" aria-labelledby="card-title">
          <div
            className="ticket-top band on-band flex flex-col gap-5"
            style={{ background: "var(--band)", borderColor: "var(--band)", padding: "22px 22px 26px" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="band-sub" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Your card
                </span>
                <h1 id="card-title" className="band-title" style={{ fontSize: 30 }}>
                  {card.name}
                </h1>
              </div>
              {p && visit && (
                <span className="display num flex-none" style={{ fontSize: 30, lineHeight: 1 }}>
                  {p.current}
                  <span className="band-sub" style={{ fontSize: 18 }}>
                    /{p.target}
                  </span>
                </span>
              )}
            </div>
            {p &&
              (visit ? (
                <PunchRow target={p.target} filled={p.current} rewardCents={p.rewardCents} size="lg" spread />
              ) : (
                <SpendBar current={p.current} target={p.target} rewardCents={p.rewardCents} />
              ))}
            {p && (
              <p className="band-sub num" style={{ fontSize: 15 }}>
                {visit
                  ? `${remaining} more visit${remaining === 1 ? "" : "s"} and ${moneyShort(p.rewardCents)} comes back to you.`
                  : `${money(p.current)} of ${money(p.target)}. Spend ${money(remaining)} more and ${moneyShort(p.rewardCents)} comes back to you.`}
              </p>
            )}
          </div>
          <div className="ticket-bottom">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              <div>
                <dt className="caption">Last visit</dt>
                <dd className="num" style={{ fontWeight: 600 }}>
                  {day(card.lastSeen, card.tz)}
                </dd>
              </div>
              <div>
                <dt className="caption">Rewards, last 90 days</dt>
                <dd className="num" style={{ fontWeight: 600 }}>
                  {card.paid.count} · {money(card.paid.cents)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="caption">How it works</dt>
                <dd className="text-2" style={{ fontSize: 14, lineHeight: 1.5 }}>
                  {card.rule}
                </dd>
              </div>
            </dl>
          </div>
        </article>

        <Link href={`/pay/${slug}`} className="btn btn-primary btn-lg">
          Pay at {card.name}
          <Icon name="arrowRight" size={18} />
        </Link>

        <section className="card card-pad flex flex-col gap-3" aria-label="About this card">
          <p className="flex items-start gap-3 text-2" style={{ fontSize: 14, lineHeight: 1.55 }}>
            <Icon name="lock" size={20} style={{ color: "var(--forest)", flex: "none", marginTop: 1 }} />
            This link is private. Anyone who has it can see this card, but it never shows your
            name or contact details.
          </p>
          <p className="flex items-start gap-3 text-2" style={{ fontSize: 14, lineHeight: 1.55 }}>
            <Icon name="phone" size={20} style={{ color: "var(--forest)", flex: "none", marginTop: 1 }} />
            Keep it on your home screen: tap Share, then Add to Home Screen.
          </p>
        </section>

        <footer className="customer-foot">
          <nav aria-label="Program information">
            <Link href={`/pay/${slug}/terms`}>Program terms</Link>
            <Link href={`/pay/${slug}/terms#why-refund`}>Why did I get a refund?</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
