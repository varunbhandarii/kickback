"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { PunchRow } from "@/components/ui";
import type { RunView } from "@/lib/demo/runs";

const ORDER = ["queued", "paying", "paid", "counted", "reward_scheduled", "refund_sent", "confirmed"];
const STEPS: { at: string; title: string; detail: (r: RunView) => string | null }[] = [
  {
    at: "paid",
    title: "The customer pays $5.50",
    detail: (r) => (r.orderId ? `Sandbox order ${r.orderId}, capture ${r.captureId ?? "…"}` : null),
  },
  {
    at: "counted",
    title: "Kickback counts the visit",
    detail: (r) => (r.progress ? `Visit ${r.progress.current} of ${r.progress.target}` : null),
  },
  {
    at: "reward_scheduled",
    title: "Guard clears the reward",
    detail: () => "Routine pattern, so it goes out right away",
  },
  {
    at: "refund_sent",
    title: "The reward goes back as a partial refund",
    detail: (r) => (r.refundId ? `Sandbox refund ${r.refundId}` : null),
  },
  {
    at: "confirmed",
    title: "PayPal confirms the refund",
    detail: (r) => (r.confirmedAt ? "Confirmed by PayPal's webhook" : "Usually within a minute"),
  },
];
const money = (cents: number) => "$" + (cents / 100).toFixed(cents % 100 ? 2 : 0);
const done = (r: RunView) => r.state === "confirmed" || r.state === "failed";

export default function RunTracker({ initial }: { initial: RunView }) {
  const [run, setRun] = useState(initial);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (done(run)) return;
    const started = Date.parse(run.createdAt);
    const timer = window.setInterval(async () => {
      if (Date.now() - started > 120000) {
        setStale(true);
        window.clearInterval(timer);
        return;
      }
      try {
        const r = await fetch(`/api/demo/runs/${run.id}`, { cache: "no-store" });
        if (r.ok) setRun((await r.json()) as RunView);
      } catch {
        /* The next poll retries. */
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [run]);
  const reached = ORDER.indexOf(run.state),
    failed = run.state === "failed";
  const reward = run.amountCents ?? run.progress?.rewardCents ?? 200;
  return (
    <div className="flex flex-col gap-6">
      <section className="card card-pad flex flex-col gap-4" aria-labelledby="ticket-title">
        <h2 id="ticket-title" className="display num" style={{ fontStretch: "125%", fontWeight: 800, fontSize: 26 }}>
          {run.progress ? `Visit ${run.progress.current} of ${run.progress.target}` : "Visit 4 of 5"}
        </h2>
        <PunchRow
          target={run.progress?.target ?? 5}
          filled={run.progress?.current ?? 4}
          rewardCents={reward}
          size="md"
          newest={Boolean(run.progress)}
          earned={reached >= ORDER.indexOf("refund_sent")}
          spread
        />
        <p className="text-ink-2" style={{ fontSize: 15 }}>
          {reached >= ORDER.indexOf("refund_sent")
            ? `The customer earned ${money(reward)} back.`
            : failed
              ? "This run stopped before a reward went out."
              : "One more visit and the reward comes back."}
        </p>
      </section>
      <section className="card card-pad flex flex-col gap-4" aria-labelledby="steps-title">
        <h2 id="steps-title" className="card-title">
          What happens
        </h2>
        <ol className="tracker" aria-live="polite">
          {STEPS.map((s) => {
            const index = ORDER.indexOf(s.at),
              complete = reached >= index,
              active = !failed && !complete && reached === index - 1;
            return (
              <li key={s.at}>
                <span
                  className={`tracker-mark ${complete ? "tracker-done" : active ? "tracker-active" : ""}`}
                  aria-hidden="true"
                >
                  {complete && <Icon name="check" size={12} strokeWidth={3.5} />}
                </span>
                <span className="flex flex-col">
                  <span style={{ fontWeight: 600 }}>
                    {s.title}
                    <span className="sr-only">{complete ? " (done)" : active ? " (in progress)" : " (waiting)"}</span>
                  </span>
                  {(complete || (s.at === "confirmed" && active)) && s.detail(run) && (
                    <span className="caption num" style={{ wordBreak: "break-all" }}>
                      {s.detail(run)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        {failed && (
          <p role="alert" className="banner banner-warn">
            {run.error ?? "The run didn't finish."}
          </p>
        )}
        {stale && !done(run) && (
          <p className="banner banner-info">
            PayPal is taking longer than usual. The refund still completes; reload this page in a minute.
          </p>
        )}
      </section>
      {run.note && reached >= ORDER.indexOf("refund_sent") && (
        <section className="card card-pad flex flex-col gap-2" aria-labelledby="note-title">
          <h2 id="note-title" className="card-title">
            The note PayPal stored on the refund
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.5 }}>&ldquo;{run.note}&rdquo;</p>
        </section>
      )}
      <section className="flex flex-col gap-3" aria-labelledby="explain-title">
        <h2 id="explain-title" className="card-title">
          What just happened
        </h2>
        <ul className="flex flex-col gap-2 text-ink-2" style={{ fontSize: 15, lineHeight: 1.6, paddingLeft: 20, listStyle: "disc" }}>
          <li>The payment is a real PayPal sandbox order, captured on Rosa&apos;s account through the customer&apos;s saved sandbox wallet.</li>
          <li>Kickback recognized the wallet with a one-way code that only works for Rosa&apos;s, counted the visit, and Guard scored the reward as routine.</li>
          <li>The reward is a partial refund of that same payment, so it returns to the wallet that paid. The customer&apos;s earlier visits are recorded sandbox replay purchases.</li>
        </ul>
      </section>
      <div className="flex flex-wrap gap-3">
        <Link href="/demo" className="btn btn-secondary">
          <Icon name="arrowLeft" size={16} />
          Back to the demo
        </Link>
        <Link href="/pay/rosas" className="btn btn-ghost">
          Pay as a customer yourself
        </Link>
      </div>
    </div>
  );
}
