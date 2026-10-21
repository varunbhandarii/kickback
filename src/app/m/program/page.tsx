export const metadata = { title: "Program" };
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { programs } from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
import { loadMerchant } from "@/lib/merchants";
import { aiBlocker } from "@/lib/ai/client";
import { prior } from "@/lib/ai/designer/context";
import { loadProgram, type ProgramSpec } from "@/lib/engine/program";
import ProgramForm from "../onboarding/program/program-form";
import { editorStart } from "../onboarding/program/editor-data";
import { Chip, PageHeader, PunchRow, Section, SpendBar, State, StatusChip } from "@/components/ui";
import { day, minutesInWords, money, pct, programHeadline } from "@/lib/format";
type Provenance = {
  source?: string;
  approvedAt?: string;
  goal?: string;
  chosenEdits?: Record<string, unknown>;
  selectedMetrics?: { monthlyCostCents: number; gmvRatio: number };
  includesDemoHistory?: boolean;
  scribe?: unknown;
};
const fieldWords: Record<string, string> = {
  n: "visits per reward",
  spendCents: "spend per reward",
  rewardCents: "reward",
  minTicketCents: "smallest purchase",
  windowDays: "window",
  mergeWindowMin: "merge window",
  perCustomerMonthlyCapCents: "customer limit",
  dailyBudgetCents: "daily budget",
  monthlyBudgetCents: "monthly budget",
  settlement: "send timing",
  winBack: "welcome-back reward",
  endowedProgress: "starting progress",
  noteVariants: "notes",
  termsIntro: "terms copy",
  workedExamples: "examples",
  signPitch: "sign pitch",
  type: "how customers earn",
};
const send: Record<ProgramSpec["settlement"], string> = {
  INSTANT: "Right after the visit",
  DELAYED: "24 hours after the visit",
  REVIEW: "After you review each one",
};
/** How a version came to be, in words. */
function origin(p: Provenance, tz: string, status: string) {
  const when = p.approvedAt ? ` on ${day(new Date(p.approvedAt), tz)}` : "";
  if (p.source === "designer") {
    const edits = Object.keys(p.chosenEdits ?? {}).map((k) => fieldWords[k] ?? k);
    return `Designed with AI from your history${when}${edits.length ? `; you edited the ${edits.join(", ")}` : ""}.`;
  }
  if (p.source === "demo-seed") return "Set up with the demo data.";
  if (status === "DRAFT") return "Draft, not activated yet.";
  if (p.source === "preset") return `Started from a preset${when}.`;
  return `Activated${when}.`;
}
/** "Effective Oct 12" for dated versions; placeholder dates are left out. */
function effective(v: { effectiveFrom: Date; retiredAt: Date | null; status: string }, tz: string) {
  const parts = [];
  if (v.status !== "DRAFT" && v.effectiveFrom.getUTCFullYear() > 2000) parts.push(`Effective ${day(v.effectiveFrom, tz)}`);
  if (v.retiredAt) parts.push(`retired ${day(v.retiredAt, tz)}`);
  return parts.length ? ` ${parts.join(", ")}.` : "";
}
export default async function ProgramOverview({
  searchParams,
}: {
  searchParams: Promise<{ suggestion?: string; rule?: string; activated?: string }>;
}) {
  const { merchant } = await requireMerchant(),
    query = await searchParams,
    loaded = await loadMerchant(merchant.slug, true),
    aiOff = (await aiBlocker(merchant)) ?? undefined;
  if (!loaded)
    return (
      <>
        <PageHeader title="Program" />
        <div className="card">
          <State
            icon="program"
            title="Finish setup to design your program"
            as="h2"
            action={
              <Link href="/m/onboarding" className="btn btn-primary">
                Continue setup
              </Link>
            }
          >
            <p>Connect PayPal and read your history first, so proposals are tested on your own sales.</p>
          </State>
        </div>
      </>
    );
  const [versions, start] = await Promise.all([
    getDb()
      .select()
      .from(programs)
      .where(eq(programs.merchantId, merchant.id))
      .orderBy(desc(programs.version))
      .limit(12),
    editorStart(merchant.id, loaded.spec, query),
  ]);
  const active = loaded.program.status === "ACTIVE";
  const s = loaded.spec;
  const provenance = loaded.program.provenance as Provenance;
  const details: [string, string][] = [
    ["Smallest purchase", money(s.minTicketCents)],
    ["Window", `${s.windowDays} days`],
    ["Purchases merged within", minutesInWords(s.mergeWindowMin)],
    ["Per customer each month", money(s.perCustomerMonthlyCapCents)],
    ["Daily and monthly budget", `${money(s.dailyBudgetCents)} · ${money(s.monthlyBudgetCents)}`],
    ["Rewards are sent", send[s.settlement]],
    [
      "Welcome-back reward",
      s.winBack ? `${money(s.winBack.rewardCents)} after ${s.winBack.gapDays} days away` : "Off",
    ],
  ];
  return (
    <>
      <PageHeader
        title="Program"
        sub="What customers earn, and what it costs you."
        actions={
          <>
            <a href="#history" className="btn btn-ghost">
              Version history
            </a>
            <a href="#edit" className="btn btn-secondary">
              Edit the rule
            </a>
          </>
        }
      />
      {query.activated === "1" && (
        <p className="banner banner-success" role="status">
          Your new program is live. Customers keep the progress they already have.
        </p>
      )}

      <section className="card card-pad grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }} aria-labelledby="live-title">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {active ? <StatusChip tone="success" label="Live now" size="sm" /> : <Chip size="sm">Draft</Chip>}
            <span className="caption">Version {loaded.program.version}</span>
          </div>
          <h2 id="live-title" className="display" style={{ fontStretch: "125%", fontWeight: 800, fontSize: "clamp(26px, 3vw, 34px)", lineHeight: 1.05 }}>
            {programHeadline(s)}
          </h2>
          {s.type === "VISIT_MILESTONE" ? (
            <PunchRow target={s.n} filled={0} rewardCents={s.rewardCents} size="md" />
          ) : (
            <SpendBar current={0} target={s.spendCents} rewardCents={s.rewardCents} />
          )}
          <p className="caption" style={{ fontSize: 14 }}>
            {origin(provenance, merchant.tz, loaded.program.status)}
            {provenance.selectedMetrics &&
              ` Backtested at ${money(provenance.selectedMetrics.monthlyCostCents)} a month, ${pct(provenance.selectedMetrics.gmvRatio)} of revenue.`}
            {provenance.includesDemoHistory && " Includes demo history."}
          </p>
          <div className="form-actions">
            <Link href={`/pay/${merchant.slug}/terms`} style={{ fontSize: 14, fontWeight: 600 }}>
              Customer terms
            </Link>
            <Link href="/m/sign" style={{ fontSize: 14, fontWeight: 600 }}>
              Pay page and sign
            </Link>
          </div>
        </div>
        <dl className="flex flex-col">
          {details.map(([label, value], i) => (
            <div
              key={label}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5"
              style={{ padding: "10px 0", borderTop: i ? "1px solid var(--line)" : undefined }}
            >
              <dt className="text-2" style={{ fontSize: 14 }}>
                {label}
              </dt>
              <dd className="num" style={{ fontSize: 14, fontWeight: 600, textAlign: "right" }}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div id="edit" style={{ scrollMarginTop: 24 }}>
        <ProgramForm
          merchantId={merchant.id}
          category={merchant.category}
          initial={start.initial}
          aiEnabled={!aiOff}
          aiOff={aiOff}
          margin={prior(merchant.category).marginPct}
          initialDesign={start.initialDesign}
          merchantName={merchant.displayName}
          live={active ? s : undefined}
          returnTo="program"
        />
      </div>

      <Section title="Version history" id="history">
        <ol className="card inbox">
          {versions.map((v) => {
            let headline = "";
            try {
              headline = programHeadline(loadProgram(v.spec));
            } catch {
              headline = "Program";
            }
            return (
              <li key={v.id} className="inbox-row">
                <span className="num" style={{ fontWeight: 700, minWidth: 34 }}>
                  v{v.version}
                </span>
                <div className="inbox-body">
                  <span className="inbox-title">{headline}</span>
                  <span className="inbox-detail">
                    {origin(v.provenance as Provenance, merchant.tz, v.status)}
                    {effective(v, merchant.tz)}
                  </span>
                </div>
                <StatusChip
                  size="sm"
                  tone={v.status === "ACTIVE" ? "success" : "neutral"}
                  label={v.status === "ACTIVE" ? "Live" : v.status === "DRAFT" ? "Draft" : "Retired"}
                />
              </li>
            );
          })}
        </ol>
      </Section>
    </>
  );
}
