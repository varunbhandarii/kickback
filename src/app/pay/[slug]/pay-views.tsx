import Link from "next/link";
import type { ReactNode } from "react";
import type { ProgramSpec } from "@/lib/engine/program";
import type { Progress } from "@/lib/engine/evaluate";
import type { MenuItem } from "@/db/schema";
import { Endorsement } from "@/components/brand";
import { Icon } from "@/components/icons";
import { PunchRow, SpendBar, Ticket } from "@/components/ui";
import {
  minutesInWords,
  money,
  moneyShort,
  ordinal,
  programHeadline,
} from "@/lib/format";

export const walletLabel = (w?: string) =>
  w?.toUpperCase() === "VENMO" ? "Venmo" : w ? "PayPal" : undefined;

/* Shop band at the top of every customer page. */
export function ShopBand({
  name,
  sub,
  sandbox,
  compact = false,
}: {
  name: string;
  sub?: ReactNode;
  sandbox: boolean;
  compact?: boolean;
}) {
  return (
    <header className="band">
      <div className="band-inner" style={compact ? { paddingBottom: 72, gap: 12 } : undefined}>
        <div className="band-row">
          {compact ? (
            <span className="display-xl" style={{ fontSize: 20 }}>
              {name}
            </span>
          ) : (
            <span className="band-sub">
              <Endorsement inverse />
            </span>
          )}
          {sandbox && <span className="band-chip">Sandbox demo</span>}
        </div>
        {!compact && <h1 className="band-title">{name}</h1>}
        {sub}
      </div>
    </header>
  );
}

/* Program promise shown before paying: empty punches and the rules in one sentence. */
export function ProgramTicket({ spec, slug }: { spec: ProgramSpec; slug: string }) {
  const sentence =
    spec.type === "VISIT_MILESTONE"
      ? `Pay here with PayPal or Venmo. Visits from ${money(spec.minTicketCents)} count, within ${spec.windowDays} days. Your ${ordinal(spec.n)} visit sends ${moneyShort(spec.rewardCents)} back to the wallet you paid with.`
      : `Pay here with PayPal or Venmo. Purchases from ${money(spec.minTicketCents)} count. Spend ${moneyShort(spec.spendCents)} within ${spec.windowDays} days and ${moneyShort(spec.rewardCents)} comes back to the wallet you paid with.`;
  return (
    <Ticket
      top={
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Regulars get money back</span>
          <h2 className="ticket-headline">{programHeadline(spec)}</h2>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {spec.type === "VISIT_MILESTONE" ? (
          <PunchRow target={spec.n} filled={0} rewardCents={spec.rewardCents} size="lg" spread />
        ) : (
          <SpendBar current={0} target={spec.spendCents} rewardCents={spec.rewardCents} />
        )}
        <p className="text-2" style={{ fontSize: 14, lineHeight: 1.5 }}>
          {sentence}{" "}
          <Link href={`/pay/${slug}/terms`} style={{ fontWeight: 600 }}>
            How it works
          </Link>
        </p>
      </div>
    </Ticket>
  );
}

/* Menu choices with an honest line about whether each one counts as a visit. */
export function MenuPicker({
  menu,
  spec,
  item,
  onSelect,
  amount,
  onAmount,
  disabled,
}: {
  menu: MenuItem[];
  spec: ProgramSpec;
  item: string;
  onSelect: (id: string) => void;
  amount: string;
  onAmount: (value: string) => void;
  disabled: boolean;
}) {
  const otherCents = Math.round(Number(amount) * 100);
  const otherValid =
    /^\d{1,3}(\.\d{1,2})?$/.test(amount) && otherCents >= 100 && otherCents <= 50000;
  const counts = (cents: number) => cents >= spec.minTicketCents;
  return (
    <section aria-labelledby="menu-title" className="flex flex-col gap-2.5">
      <h2 id="menu-title" className="card-title" style={{ fontSize: 17, padding: "0 4px" }}>
        What are you having?
      </h2>
      <div className="card menu-list" role="group" aria-labelledby="menu-title">
        {menu.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="menu-row"
            aria-pressed={item === entry.id}
            disabled={disabled}
            onClick={() => onSelect(entry.id)}
          >
            <span className="menu-check" aria-hidden="true">
              {item === entry.id && <Icon name="check" size={13} strokeWidth={3.5} />}
            </span>
            <span className="menu-name">
              <span className="menu-title">{entry.name}</span>
              <span className={`menu-note${counts(entry.priceCents) ? " menu-note-ok" : ""}`}>
                {counts(entry.priceCents)
                  ? "Counts as a visit"
                  : `Under ${money(spec.minTicketCents)}, does not count as a visit`}
              </span>
            </span>
            <span className="menu-price">{money(entry.priceCents)}</span>
          </button>
        ))}
        <button
          type="button"
          className="menu-row"
          aria-pressed={item === "other"}
          disabled={disabled}
          onClick={() => onSelect("other")}
        >
          <span className="menu-check" aria-hidden="true">
            {item === "other" && <Icon name="check" size={13} strokeWidth={3.5} />}
          </span>
          <span className="menu-name">
            <span className="menu-title">Other amount</span>
          </span>
        </button>
      </div>
      {item === "other" && (
        <div className="field" style={{ padding: "4px 4px 0" }}>
          <label className="field-label" htmlFor="pay-amount">
            Amount in USD
          </label>
          <div className="affix">
            <span className="affix-text" aria-hidden="true">
              $
            </span>
            <input
              id="pay-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => onAmount(e.target.value)}
              disabled={disabled}
              aria-describedby="pay-amount-help"
            />
          </div>
          <span
            id="pay-amount-help"
            className={`menu-note${otherValid && counts(otherCents) ? " menu-note-ok" : ""}`}
          >
            {!otherValid
              ? "Enter an amount from $1 to $500."
              : counts(otherCents)
                ? "Counts as a visit"
                : `Under ${money(spec.minTicketCents)}, does not count as a visit`}
          </span>
        </div>
      )}
    </section>
  );
}

export function PayFooter({
  slug,
  spec,
  sandbox,
}: {
  slug: string;
  spec: ProgramSpec;
  sandbox: boolean;
}) {
  return (
    <footer className="customer-foot">
      <nav aria-label="Program information">
        <Link href={`/pay/${slug}/terms`}>Program terms</Link>
        <Link href={`/pay/${slug}/terms#why-refund`}>Why did I get a refund?</Link>
        <Link href="/privacy">Privacy</Link>
      </nav>
      <p>
        Qualifying purchases start at {money(spec.minTicketCents)}. Purchases within{" "}
        {minutesInWords(spec.mergeWindowMin)} count as one visit.
      </p>
      {sandbox && <p>Use sandbox accounts only. Test balances have no real value.</p>}
    </footer>
  );
}

const DONE = ["SENT", "CONFIRMED"];

/* Progress after a recognized payment that did not complete a card. */
export function VisitTicket({
  progress,
  spec,
  paidCents,
}: {
  progress: Progress;
  spec: ProgramSpec;
  paidCents?: number;
}) {
  const remaining = Math.max(0, progress.target - progress.current);
  const under = paidCents !== undefined && paidCents < spec.minTicketCents;
  const visit = progress.type === "VISIT_MILESTONE";
  return (
    <Ticket
      top={
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">Your card</span>
          <h2 className="ticket-big">
            {visit
              ? `Visit ${progress.current} of ${progress.target}`
              : `${money(progress.current)} of ${money(progress.target)}`}
          </h2>
          <p className="text-2" style={{ fontSize: 15 }}>
            {visit
              ? `${remaining} more visit${remaining === 1 ? "" : "s"} and ${moneyShort(progress.rewardCents)} comes back to you.`
              : `Spend ${money(remaining)} more and ${moneyShort(progress.rewardCents)} comes back to you.`}
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {visit ? (
          <PunchRow
            target={progress.target}
            filled={progress.current}
            rewardCents={progress.rewardCents}
            size="lg"
            spread
            newest={!under && progress.current > 0}
            animate={!under}
          />
        ) : (
          <SpendBar current={progress.current} target={progress.target} rewardCents={progress.rewardCents} />
        )}
        {under && (
          <p className="banner banner-info">
            This purchase was under {money(spec.minTicketCents)}, so it didn&apos;t count as a visit.
          </p>
        )}
        {progress.blocked && (
          <p className="banner banner-info">
            You&apos;ve reached this month&apos;s reward limit. Your visits still count toward later rewards.
          </p>
        )}
        <p className="caption">
          Visits from the last {progress.windowDays} days count. Purchases within{" "}
          {minutesInWords(spec.mergeWindowMin)} count as one visit.
        </p>
      </div>
    </Ticket>
  );
}

/* A completed card: the reward, where it is, and why it arrives as a refund. */
export function RewardTicket({
  reward,
  spec,
  name,
  wallet,
}: {
  reward: { state: string; amountCents: number; kind?: string };
  spec: ProgramSpec;
  name: string;
  wallet?: string;
}) {
  const amount = moneyShort(reward.amountCents);
  const where = wallet ?? "wallet";
  const sent = DONE.includes(reward.state);
  const inFlight = ["EARNED", "SCHEDULED", "SENDING"].includes(reward.state);
  const winBack = reward.kind === "WIN_BACK";
  const line: Record<string, string> = {
    SENT: `Sent to your ${where}.`,
    CONFIRMED: `Sent to your ${where}.`,
    HELD: `${name} will confirm your reward shortly.`,
    DEFERRED: `${name} will send it to your ${where} shortly.`,
    FAILED: `Your reward needs a check by ${name}. Please ask at the counter.`,
    CANCELLED: "This reward is no longer eligible. See the program terms.",
    OFFSET: "Your reward was applied to an earlier returned purchase.",
  };
  const showTracker = !["FAILED", "CANCELLED", "OFFSET"].includes(reward.state);
  return (
    <>
      <Ticket
        top={
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow" style={{ color: "var(--forest)" }}>
              {winBack ? "Welcome back" : "Card complete"}
            </span>
            <h2 className="ticket-big">You earned {amount} back</h2>
            <p className="text-2" style={{ fontSize: 15 }}>
              {line[reward.state] ?? `${name} is sending it to your ${where} now.`}
            </p>
          </div>
        }
      >
        {spec.type === "VISIT_MILESTONE" && !winBack ? (
          <PunchRow target={spec.n} filled={spec.n} rewardCents={reward.amountCents} size="lg" spread earned animate />
        ) : (
          <SpendBar
            current={1}
            target={1}
            rewardCents={reward.amountCents}
            label={`Reward of ${amount} earned`}
          />
        )}
      </Ticket>
      {showTracker && (
        <section className="card card-pad flex flex-col gap-4" aria-labelledby="where-title">
          <h2 id="where-title" className="card-title">
            Where your {amount} is
          </h2>
          <ol className="tracker">
            <li>
              <span className="tracker-mark tracker-done" aria-hidden="true">
                <Icon name="check" size={12} strokeWidth={3.5} />
              </span>
              <span className="flex flex-col">
                <span style={{ fontWeight: 600 }}>Earned</span>
                <span className="caption">{winBack ? "Your return visit" : `Your ${ordinal(spec.type === "VISIT_MILESTONE" ? spec.n : 1)} visit`}</span>
              </span>
            </li>
            <li>
              <span
                className={`tracker-mark ${sent ? "tracker-done" : inFlight ? "tracker-active" : ""}`}
                aria-hidden="true"
              >
                {sent && <Icon name="check" size={12} strokeWidth={3.5} />}
                {!sent && !inFlight && <Icon name="clock" size={13} />}
              </span>
              <span className="flex flex-col">
                <span style={{ fontWeight: 600 }}>
                  {reward.state === "HELD" ? `Being confirmed by ${name}` : `Sending to your ${where}`}
                </span>
                <span className="caption">
                  {sent ? "Done" : inFlight ? "Usually under a minute; some rewards go out the next day" : "Waiting"}
                </span>
              </span>
            </li>
            <li>
              <span className={`tracker-mark ${sent ? "tracker-done" : ""}`} aria-hidden="true">
                {sent && <Icon name="check" size={12} strokeWidth={3.5} />}
              </span>
              <span className="flex flex-col">
                <span style={{ fontWeight: sent ? 600 : 500, color: sent ? undefined : "var(--ink-2)" }}>
                  In your activity
                </span>
                <span className="caption">
                  Shows as a {money(reward.amountCents)} refund from {name} with a thank-you note
                </span>
              </span>
            </li>
          </ol>
          <p className="sr-only" role="status">
            {sent ? `Your ${amount} reward was sent.` : `Your ${amount} reward is ${reward.state === "HELD" ? "being confirmed" : "on its way"}.`}
          </p>
        </section>
      )}
      <details className="card card-pad" open>
        <summary style={{ fontWeight: 600, cursor: "pointer" }}>Why is it a refund?</summary>
        <p className="text-2" style={{ marginTop: 10, fontSize: 15, lineHeight: 1.55 }}>
          Your reward comes back as part of this purchase&apos;s payment, so it lands in the same
          wallet you paid with. It is a loyalty reward, not an error or a return. Nothing about
          your order changes.
        </p>
      </details>
    </>
  );
}

/* Private link to the saved card. */
export function SaveCard({
  url,
  canShare,
  name,
  onCopy,
  onShare,
  status,
}: {
  url: string;
  canShare: boolean;
  name: string;
  onCopy: () => void;
  onShare: () => void;
  status: string;
}) {
  return (
    <section className="card card-pad flex flex-col gap-3" aria-labelledby="save-title">
      <div className="flex items-start gap-3">
        <span
          className="flex flex-none items-center justify-center"
          style={{ width: 36, height: 36, borderRadius: 10, background: "var(--forest-tint)", color: "var(--forest)" }}
          aria-hidden="true"
        >
          <Icon name="bookmark" size={18} />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="save-title" className="card-title">
            Save this link to keep your card
          </h2>
          <p className="text-2" style={{ fontSize: 14, lineHeight: 1.5 }}>
            Open it anytime to see your visits at {name}. It shows a visit count only, never
            your name or email. Keep it private.
          </p>
        </div>
      </div>
      <div className="flex gap-2.5">
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={onCopy}>
          <Icon name="copy" size={16} />
          Copy link
        </button>
        {canShare && (
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onShare}>
            <Icon name="share" size={16} />
            Share link
          </button>
        )}
      </div>
      <p className="status-line" role="status">
        {status}
      </p>
      <p className="caption">
        <a href={url}>Open your card</a> · On a phone, use Share, then Add to Home Screen.
      </p>
    </section>
  );
}

export function Receipt({
  name,
  amountCents,
  wallet,
  counted,
}: {
  name: string;
  amountCents: number;
  wallet?: string;
  counted?: string;
}) {
  return (
    <section className="card receipt" aria-label="Receipt">
      <div className="receipt-row muted">
        <span>{name}</span>
        <span>Today</span>
      </div>
      <div className="receipt-rule" />
      <div className="receipt-row">
        <span>Paid</span>
        <span className="num">{money(amountCents)}</span>
      </div>
      {wallet && (
        <div className="receipt-row">
          <span>With</span>
          <span>{wallet}</span>
        </div>
      )}
      {counted && (
        <div className="receipt-row" style={{ color: "var(--forest)", fontWeight: 600 }}>
          <span>Counted as</span>
          <span>{counted}</span>
        </div>
      )}
    </section>
  );
}
