"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { SubmitButton } from "@/components/form-controls";
import { CopyButton, Toaster } from "@/components/toast";
import {
  getDemoBuyer,
  startDemoSession,
  startWatch,
  type BuyerState,
  type DemoState,
} from "./actions";

function Card({
  icon,
  title,
  meta,
  children,
}: {
  icon: IconName;
  title: string;
  meta: string;
  children: React.ReactNode;
}) {
  const id = title.toLowerCase().replaceAll(/[^a-z]+/g, "-");
  return (
    <section className="card card-pad flex flex-col gap-4" aria-labelledby={id}>
      <span
        className="flex items-center justify-center"
        style={{ width: 40, height: 40, borderRadius: 12, background: "var(--forest-tint)", color: "var(--forest)" }}
        aria-hidden="true"
      >
        <Icon name={icon} size={20} />
      </span>
      <div className="flex flex-col gap-1">
        <h2 id={id} className="card-title" style={{ fontSize: 20 }}>
          {title}
        </h2>
        <p className="caption" style={{ fontSize: 14 }}>
          {meta}
        </p>
      </div>
      {children}
    </section>
  );
}

function Problem({ state }: { state: DemoState }) {
  if (!state.error) return null;
  return (
    <div role="alert" className="banner banner-info" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
      <span>{state.error}</span>
      {state.lastRunId && (
        <Link href={`/demo/runs/${state.lastRunId}`} style={{ fontWeight: 600 }}>
          Watch the most recent run
        </Link>
      )}
    </div>
  );
}

export function WatchCard({ unavailable, lastRunId }: { unavailable?: string; lastRunId?: string }) {
  const [state, action] = useActionState<DemoState>(startWatch, {});
  return (
    <Card icon="play" title="Watch a reward happen" meta="No sign-in · about 45 seconds">
      <p className="text-ink-2" style={{ fontSize: 15, lineHeight: 1.6 }}>
        A demo customer at visit 4 of 5 pays Rosa&apos;s Cafe $5.50 with a saved sandbox wallet. You see the
        visit count, the reward pass Guard, and the $2 partial refund go back with its thank-you note.
      </p>
      {unavailable ? (
        <Problem state={{ error: unavailable, lastRunId }} />
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <SubmitButton className="btn btn-primary" pendingLabel="Starting…">
            <Icon name="play" size={16} />
            Start a live run
          </SubmitButton>
          <Problem state={state} />
        </form>
      )}
    </Card>
  );
}

export function PayCard({ initial, closed, venmoNote }: { initial: BuyerState; closed?: string; venmoNote: string }) {
  const [state, action] = useActionState<BuyerState>(getDemoBuyer, initial);
  const buyer = state.buyer;
  return (
    <Card icon="receipt" title="Pay as a customer" meta="PayPal sandbox login · about 3 minutes · phone or desktop">
      <ol className="flex flex-col gap-2 text-ink-2" style={{ fontSize: 15, lineHeight: 1.55, paddingLeft: 20, listStyle: "decimal" }}>
        <li>Get a demo buyer below. It is held for you for 30 minutes.</li>
        <li>
          Open <Link href="/pay/rosas">Rosa&apos;s pay page</Link> and pick any item from $3.00.
        </li>
        <li>Choose PayPal and sign in on sandbox.paypal.com with the buyer&apos;s details.</li>
        <li>Your purchase is visit 5 of 5, so the $2 reward comes back on the thank-you screen.</li>
      </ol>
      {buyer ? (
        <div className="card card-tint flex flex-col gap-2" style={{ padding: 14 }}>
          <span className="eyebrow">Your demo buyer</span>
          <span className="flex items-center justify-between gap-2" style={{ fontSize: 15 }}>
            <span className="num" style={{ wordBreak: "break-all" }}>
              {buyer.email}
            </span>
            <CopyButton value={buyer.email} label="Copy email" />
          </span>
          <span className="flex items-center justify-between gap-2" style={{ fontSize: 15 }}>
            <span className="num">{buyer.password}</span>
            <CopyButton value={buyer.password} label="Copy password" />
          </span>
          <span className="caption">
            Held until{" "}
            {new Date(buyer.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Sandbox
            account with test balances. Please don&apos;t change its password.
          </span>
          <Link href="/pay/rosas" className="btn btn-primary">
            Open Rosa&apos;s pay page
            <Icon name="arrowRight" size={16} />
          </Link>
        </div>
      ) : closed ? (
        <Problem state={{ error: closed }} />
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <SubmitButton className="btn btn-primary" pendingLabel="Finding a buyer…">
            Get a demo buyer
          </SubmitButton>
          <Problem state={state} />
        </form>
      )}
      <p className="caption" style={{ fontSize: 13.5 }}>
        {venmoNote}
      </p>
    </Card>
  );
}

export function ExploreCard() {
  const [state, action] = useActionState<DemoState>(startDemoSession, {});
  return (
    <Card icon="cockpit" title="Explore the merchant app" meta="Read-only · Cockpit and Analyst included">
      <p className="text-ink-2" style={{ fontSize: 15, lineHeight: 1.6 }}>
        Look around Rosa&apos;s Cafe, Bright Salon and Loaf Bakery as their owner sees them: rewards Guard held
        for review, regulars close to a reward, the program designer and the Cockpit. Ask the Analyst a question.
        Changes are turned off.
      </p>
      <form action={action} className="flex flex-col gap-3">
        <SubmitButton className="btn btn-secondary" pendingLabel="Opening…">
          Explore read-only
          <Icon name="arrowRight" size={16} />
        </SubmitButton>
        <Problem state={state} />
      </form>
      <Toaster />
    </Card>
  );
}
