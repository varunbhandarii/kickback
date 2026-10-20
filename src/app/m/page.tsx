import Link from "next/link";
import DigestCard from "./digest-card";
import { and, desc, eq, gte, inArray, lt, sql, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  captures,
  connections,
  customers,
  rewards,
  settings,
  visits,
  notices,
  suggestions,
  designRuns,
} from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
import { loadMerchant } from "@/lib/merchants";
import { localDay } from "@/lib/engine/evaluate";
import type { Progress } from "@/lib/engine/evaluate";
import { toggleRewards, dismissIdea, dismissNotice } from "./actions";
import type { DesignResult } from "@/lib/ai/designer/pipeline";
import { Icon } from "@/components/icons";
import {
  Chip,
  Kpi,
  Meter,
  MiniProgress,
  PageHeader,
  Section,
  Sparkline,
  StatusChip,
} from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/form-controls";
import {
  customerCode,
  lastSeen,
  money,
  pct,
  programHeadline,
  when,
} from "@/lib/format";
import {
  connectionStatus,
  noticeKind,
  noticeTone,
  rewardReason,
  type Tone,
} from "@/lib/copy";
export const metadata = { title: "Overview" };
const steps = [
  ["business", "Business"],
  ["connect", "Connect PayPal"],
  ["history", "Read your history"],
  ["program", "Design the program"],
  ["menu", "Menu and sign"],
] as const;
type InboxItem = {
  key: string;
  tone: Tone;
  chip: string;
  title: string;
  detail?: string;
  action?: { href: string; label: string };
  dismiss?: string;
};
/** The last 30 local days, oldest first, for the sparklines. */
function lastDays(tz: string, now = Date.now()) {
  return [...new Set(Array.from({ length: 30 }, (_, i) => localDay(new Date(now - (29 - i) * 86400000), tz)))];
}
export default async function Dashboard() {
  const { merchant } = await requireMerchant(),
    db = getDb(),
    from = sql`(((now() at time zone ${merchant.tz})::date - 29)::timestamp at time zone ${merchant.tz})`;
  const [
    [connection],
    loaded,
    [kpi],
    [paid],
    needs,
    pending,
    frozen,
    unreconciled,
    visitDays,
    rewardDays,
  ] = await Promise.all([
    db
      .select()
      .from(connections)
      .where(eq(connections.merchantId, merchant.id)),
    loadMerchant(merchant.slug, true),
    db
      .select({
        visits: sql<number>`count(*)::int`,
        customers: sql<number>`count(distinct ${visits.customerKey})::int`,
        revenue: sql<number>`coalesce(sum(${visits.amountCents}),0)::int`,
      })
      .from(visits)
      .where(
        and(
          eq(visits.merchantId, merchant.id),
          eq(visits.status, "COMPLETED"),
          gte(visits.startedAt, from),
        ),
      ),
    db
      .select({
        count: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${rewards.amountCents}-${rewards.offsetAppliedCents}),0)::int`,
      })
      .from(rewards)
      .where(
        and(
          eq(rewards.merchantId, merchant.id),
          inArray(rewards.state, ["SENT", "CONFIRMED"]),
          gte(rewards.sentAt, from),
        ),
      ),
    db
      .select()
      .from(rewards)
      .where(
        and(
          eq(rewards.merchantId, merchant.id),
          inArray(rewards.state, ["HELD", "FAILED"]),
        ),
      )
      .orderBy(desc(rewards.createdAt))
      .limit(10),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(captures)
      .where(
        and(
          eq(captures.merchantId, merchant.id),
          eq(captures.status, "PENDING"),
          lt(captures.capturedAt, sql`now()-interval '24 hours'`),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, merchant.id),
          eq(customers.status, "FROZEN"),
        ),
      ),
    db
      .select({ key: settings.key })
      .from(settings)
      .where(
        sql`${settings.key} like ${`reward:${merchant.id}:%:unreconciled`}`,
      )
      .limit(20),
    db
      .select({
        day: sql<string>`to_char((${visits.startedAt} at time zone ${merchant.tz})::date, 'YYYY-MM-DD')`,
        n: sql<number>`count(*)::int`,
      })
      .from(visits)
      .where(
        and(
          eq(visits.merchantId, merchant.id),
          eq(visits.status, "COMPLETED"),
          gte(visits.startedAt, from),
        ),
      )
      .groupBy(sql`1`),
    db
      .select({
        day: sql<string>`to_char((${rewards.sentAt} at time zone ${merchant.tz})::date, 'YYYY-MM-DD')`,
        cents: sql<number>`coalesce(sum(${rewards.amountCents}-${rewards.offsetAppliedCents}),0)::int`,
      })
      .from(rewards)
      .where(
        and(
          eq(rewards.merchantId, merchant.id),
          inArray(rewards.state, ["SENT", "CONFIRMED"]),
          gte(rewards.sentAt, from),
        ),
      )
      .groupBy(sql`1`),
  ]);
  const regulars = await db
    .select({ key: visits.customerKey })
    .from(visits)
    .where(
      and(
        eq(visits.merchantId, merchant.id),
        eq(visits.status, "COMPLETED"),
        gte(visits.startedAt, from),
        gte(visits.amountCents, loaded?.spec.minTicketCents ?? 1),
      ),
    )
    .groupBy(visits.customerKey)
    .having(sql`count(*) >= 4`);
  const [fixtureCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(visits)
    .where(
      and(eq(visits.merchantId, merchant.id), eq(visits.source, "FIXTURE")),
    );
  const alerts = await db
    .select()
    .from(notices)
    .where(and(eq(notices.merchantId, merchant.id), isNull(notices.readAt)))
    .orderBy(desc(notices.createdAt))
    .limit(20);
  const [idea] = await db
    .select({ suggestion: suggestions, run: designRuns })
    .from(suggestions)
    .innerJoin(designRuns, eq(designRuns.id, suggestions.designRunId))
    .where(
      and(
        eq(suggestions.merchantId, merchant.id),
        eq(suggestions.status, "PENDING"),
      ),
    );
  const closest = await db
    .select({
      key: customers.key,
      progress: customers.progress,
      lastSeen: customers.lastSeen,
      // Column names are written out: select lists leave interpolated columns unqualified.
      demo: sql<boolean>`not exists (select 1 from "visits" v where v."merchant_id" = "customers"."merchant_id" and v."customer_key" = "customers"."key" and v."source" <> 'FIXTURE')`,
    })
    .from(customers)
    .where(
      and(
        eq(customers.merchantId, merchant.id),
        eq(customers.status, "OK"),
        sql`coalesce((${customers.progress}->>'target')::numeric, 0) > 0`,
        sql`coalesce((${customers.progress}->>'current')::numeric, 0) > 0`,
      ),
    )
    .orderBy(
      sql`(${customers.progress}->>'current')::numeric / (${customers.progress}->>'target')::numeric desc`,
      desc(customers.lastSeen),
    )
    .limit(5);

  const spec = loaded?.spec;
  const connected = connection?.status === "CONNECTED";
  const active = loaded?.program.status === "ACTIVE";
  const status: { tone: Tone; label: string } = !connected
    ? { tone: "danger", label: "PayPal not connected" }
    : !active
      ? { tone: "neutral", label: "Program not active" }
      : merchant.rewardsPaused
        ? { tone: "info", label: "Rewards paused" }
        : { tone: "success", label: "Rewards on" };

  const days = lastDays(merchant.tz);
  const visitsByDay = new Map(visitDays.map((d) => [d.day, d.n]));
  const rewardsByDay = new Map(rewardDays.map((d) => [d.day, d.cents]));
  const visitSeries = days.map((d) => visitsByDay.get(d) ?? 0);
  const rewardSeries = days.map((d) => rewardsByDay.get(d) ?? 0);
  const earnedRatio = paid.count / Math.max(1, kpi.visits);
  const costRatio = kpi.revenue > 0 ? paid.cents / kpi.revenue : 0;

  const stepIndex = steps.findIndex(([s]) => s === merchant.onboardingStep);
  const setupDone = merchant.onboardingStep === "done";
  const notesNeedUpdate =
    !!spec &&
    [spec.noteTemplate, ...(spec.noteVariants ?? []), ...(spec.welcomeBackNote ? [spec.welcomeBackNote] : [])].some(
      (n) => !/loyalty reward/i.test(n),
    );

  const inbox: InboxItem[] = [];
  for (const r of needs.filter((r) => r.state === "HELD"))
    inbox.push({
      key: r.id,
      tone: "warn",
      chip: "Needs review",
      title: `${money(r.amountCents - r.offsetAppliedCents)} reward for ${customerCode(r.customerKey)} is waiting for you`,
      detail: `Held ${when(r.createdAt, merchant.tz)}`,
      action: { href: "/m/rewards?state=HELD", label: "Review" },
    });
  for (const r of needs.filter((r) => r.state === "FAILED"))
    inbox.push({
      key: r.id,
      tone: "danger",
      chip: "Failed",
      title: `${money(r.amountCents - r.offsetAppliedCents)} reward for ${customerCode(r.customerKey)} couldn't be sent`,
      detail: rewardReason(r.reason) || undefined,
      action: { href: "/m/rewards?state=FAILED", label: "View" },
    });
  if (setupDone && !connected)
    inbox.push({
      key: "connection",
      tone: "danger",
      chip: connectionStatus(connection?.status).label,
      title: "PayPal isn't connected, so payments and rewards are stopped",
      action: { href: "/m/onboarding/connect", label: "Reconnect" },
    });
  for (const notice of alerts)
    inbox.push({
      key: notice.id,
      tone: noticeTone(notice.kind, notice.severity),
      chip: noticeKind(notice.kind),
      title: notice.body,
      action:
        notice.kind === "REVIEW_OVERDUE"
          ? { href: "/m/rewards?state=HELD", label: "Review" }
          : notice.kind === "FROZEN"
            ? { href: "/m/customers?filter=paused", label: "View" }
            : { href: "/m/program", label: "Adjust program" },
      dismiss: notice.id,
    });
  if (notesNeedUpdate)
    inbox.push({
      key: "notes",
      tone: "warn",
      chip: "Update",
      title: "Update your thank-you notes to say “loyalty reward”",
      detail: "Your approved notes stay active until you review your program.",
      action: { href: "/m/program", label: "Review program" },
    });
  if (frozen[0].count && !alerts.some((a) => a.kind === "FROZEN"))
    inbox.push({
      key: "frozen",
      tone: "info",
      chip: "Paused · dispute",
      title: `${frozen[0].count} customer${frozen[0].count === 1 ? " is" : "s are"} paused while a return or dispute is reviewed`,
      action: { href: "/m/customers?filter=paused", label: "View" },
    });
  if (pending[0].count)
    inbox.push({
      key: "pending",
      tone: "info",
      chip: "Waiting",
      title: `${pending[0].count} payment${pending[0].count === 1 ? " has" : "s have"} been pending for more than 24 hours`,
      detail: "They count as visits once PayPal completes them.",
    });
  if (unreconciled.length)
    inbox.push({
      key: "unreconciled",
      tone: "info",
      chip: "Reporting",
      title: "Some sent rewards need reporting reconciliation",
      detail: "Their state is preserved.",
      action: { href: "/m/rewards", label: "View rewards" },
    });

  const ideaCard =
    idea && idea.run.expiresAt > new Date()
      ? (idea.run.result as DesignResult).cards.find((c) => c.params.id === idea.suggestion.candidateId)
      : undefined;

  return (
    <>
      <PageHeader
        title="Overview"
        sub={`${merchant.displayName} · last 30 days · times in ${merchant.tz}`}
        actions={
          <>
            <StatusChip tone={status.tone} label={status.label} />
            {connected && active && (
              <form action={toggleRewards}>
                <input name="merchantId" type="hidden" value={merchant.id} />
                <input name="paused" type="hidden" value={merchant.rewardsPaused ? "no" : "yes"} />
                {merchant.rewardsPaused ? (
                  <SubmitButton className="btn btn-primary">
                    <Icon name="play" size={16} />
                    Resume rewards
                  </SubmitButton>
                ) : (
                  <ConfirmButton
                    title={`Pause rewards at ${merchant.displayName}?`}
                    body={
                      <p>
                        Customers can still pay and their visits still count. Earned rewards wait and are sent
                        after you resume.
                      </p>
                    }
                    confirmLabel="Pause rewards"
                  >
                    <Icon name="pause" size={16} />
                    Pause rewards
                  </ConfirmButton>
                )}
              </form>
            )}
            <a className="btn btn-ghost" href={`/pay/${merchant.slug}`} target="_blank" rel="noopener">
              Open pay page
              <Icon name="external" size={16} />
            </a>
          </>
        }
      />

      {!!fixtureCount.n && (
        <p className="banner">
          <Chip tone="demo" size="sm">
            Demo data
          </Chip>
          <span className="min-w-0 flex-1">
            {fixtureCount.n} synthetic visits are included so backtests have history. They never earn refunds.
          </span>
          <Link href="/m/cockpit" prefetch={false}>
            Filter them out in Cockpit
          </Link>
        </p>
      )}

      {!setupDone && (
        <section className="card card-pad flex flex-col gap-4" aria-labelledby="setup-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="setup-title" className="card-title">
                Finish setting up {merchant.displayName}
              </h2>
              <p className="caption" style={{ fontSize: 14 }}>
                Step {Math.max(1, stepIndex + 1)} of {steps.length}
              </p>
            </div>
            <Link href="/m/onboarding" className="btn btn-primary">
              Continue setup
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>
          <ol className="flex flex-wrap gap-2">
            {steps.map(([key, label], i) => (
              <li key={key}>
                <Chip tone={i < stepIndex ? "success" : i === stepIndex ? "info" : "neutral"} icon={i < stepIndex ? "check" : undefined}>
                  {label}
                </Chip>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Section title="Needs you" id="needs">
        {inbox.length ? (
          <ul className="card inbox">
            {inbox.map((item) => (
              <li key={item.key} className="inbox-row">
                <StatusChip tone={item.tone} label={item.chip} size="sm" />
                <div className="inbox-body">
                  <span className="inbox-title">{item.title}</span>
                  {item.detail && <span className="inbox-detail">{item.detail}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {item.action && (
                    <Link href={item.action.href} className="btn btn-secondary btn-sm">
                      {item.action.label}
                    </Link>
                  )}
                  {item.dismiss && (
                    <form action={dismissNotice}>
                      <input type="hidden" name="merchantId" value={merchant.id} />
                      <input type="hidden" name="id" value={item.dismiss} />
                      <button type="submit" className="icon-btn icon-btn-plain" aria-label="Dismiss notice" title="Dismiss">
                        <Icon name="x" size={16} />
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing needs you right now.</p>
        )}
      </Section>

      <Section title="Last 30 days" id="kpis">
        <div className="kpi-grid">
          <Kpi label="Rewards sent" value={money(paid.cents)} sub={`${paid.count} reward${paid.count === 1 ? "" : "s"}`}>
            <Sparkline values={rewardSeries} label={`Rewards sent per day, last 30 days. Total ${money(paid.cents)}.`} />
          </Kpi>
          <Kpi label="Visits" value={kpi.visits.toLocaleString("en-US")} sub={`${kpi.customers} customers`}>
            <Sparkline values={visitSeries} label={`Visits per day, last 30 days. Total ${kpi.visits}.`} />
          </Kpi>
          <Kpi label="Regulars" value={regulars.length} sub={`of ${kpi.customers} recognized`}>
            <Meter
              value={regulars.length}
              max={Math.max(1, kpi.customers)}
              label={`${regulars.length} of ${kpi.customers} recognized customers made 4 or more qualifying visits`}
            />
            <span className="caption">4 or more qualifying visits</span>
          </Kpi>
          <Kpi label="Visits that earned a reward" value={pct(earnedRatio)}>
            <Meter
              value={earnedRatio}
              max={0.2}
              guideline={0.1}
              label={`${pct(earnedRatio)} of visits earned a reward; guideline 10%`}
              labels={[
                { at: 0, text: "0%" },
                { at: 0.1, text: "10% guideline" },
              ]}
            />
          </Kpi>
          {kpi.revenue > 0 && (
            <Kpi label="Reward cost of PayPal revenue" value={pct(costRatio)} sub={`of ${money(kpi.revenue)}`}>
              <Meter
                value={costRatio}
                max={0.06}
                guideline={0.03}
                limit={0.05}
                label={`Rewards cost ${pct(costRatio)} of payment revenue; guideline 3%, limit 5%`}
                labels={[
                  { at: 0, text: "0%" },
                  { at: 0.03, text: "3%" },
                  { at: 0.05, text: "5% limit" },
                ]}
              />
            </Kpi>
          )}
        </div>
      </Section>

      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
        <Section
          title="Closest to a reward"
          id="closest"
          action={
            <Link href="/m/customers?filter=close" style={{ fontSize: 14, fontWeight: 600 }}>
              All customers
            </Link>
          }
        >
          {closest.length ? (
            <ul className="card inbox">
              {closest.map((c) => {
                const p = c.progress as Progress;
                return (
                  <li key={c.key} className="inbox-row">
                    <div className="inbox-body" style={{ flexBasis: 140 }}>
                      <Link href={`/m/customers?customer=${encodeURIComponent(c.key)}`} className="mono inbox-title" style={{ color: "var(--ink)" }}>
                        {customerCode(c.key)}
                      </Link>
                      <span className="inbox-detail">
                        Last visit: {lastSeen(c.lastSeen, merchant.tz)}
                        {c.demo && " · demo"}
                      </span>
                    </div>
                    <MiniProgress type={p.type} current={p.current} target={p.target} rewardCents={p.rewardCents} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="card card-pad muted">No one has started a card yet. Visits show up here after the first payment.</p>
          )}
        </Section>

        <div className="flex flex-col gap-6">
          <DigestCard merchantId={merchant.id} />
          {ideaCard && idea && (
            <section className="card card-tint card-pad flex flex-col gap-3" aria-labelledby="idea-title">
              <p className="eyebrow" style={{ color: "var(--forest)" }}>
                <Icon name="sparkles" size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
                Idea for next month
              </p>
              <h2 id="idea-title" className="card-title">
                {ideaCard.params.name}
              </h2>
              <p className="text-2" style={{ fontSize: 14.5, lineHeight: 1.55 }}>
                {ideaCard.explanation.pitch}
              </p>
              <div className="form-actions">
                <Link href={`/m/program?suggestion=${idea.suggestion.id}`} className="btn btn-primary btn-sm">
                  Review the idea
                </Link>
                <form action={dismissIdea}>
                  <input type="hidden" name="merchantId" value={merchant.id} />
                  <input type="hidden" name="id" value={idea.suggestion.id} />
                  <SubmitButton className="btn btn-ghost btn-sm">Not now</SubmitButton>
                </form>
              </div>
            </section>
          )}
          {spec && (
            <section className="card card-pad flex flex-col gap-3" aria-labelledby="program-title">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">Your program</p>
                <Link href="/m/program" style={{ fontSize: 14, fontWeight: 600 }}>
                  Open program
                </Link>
              </div>
              <h2 id="program-title" className="display" style={{ fontSize: 20 }}>
                {programHeadline(spec)}
              </h2>
              <p className="caption" style={{ fontSize: 13.5 }}>
                Daily budget {money(spec.dailyBudgetCents)} · monthly {money(spec.monthlyBudgetCents)} · up to{" "}
                {money(spec.perCustomerMonthlyCapCents)} per customer each month
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
