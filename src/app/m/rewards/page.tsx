import Link from "next/link";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  captures,
  customers,
  guardFlags,
  programs,
  rewards,
  rewardState as rewardStates,
  visits,
} from "@/db/schema";
import ReviewControls from "./review-controls";
import { explainReview } from "./actions";
import { requireMerchant } from "@/lib/dal";
import { aiBlocker } from "@/lib/ai/client";
import type { ProgramSpec } from "@/lib/engine/program";
import { Icon } from "@/components/icons";
import { Meter, PageHeader, Section, State, StatusChip } from "@/components/ui";
import { SubmitButton } from "@/components/form-controls";
import { CopyButton } from "@/components/toast";
import { customerCode, money, when } from "@/lib/format";
import {
  guardReasonPoints,
  guardTier,
  rewardKind,
  rewardReason,
  rewardState,
  wallet,
} from "@/lib/copy";
import { DemoLock } from "@/components/demo-lock";
export const metadata = { title: "Rewards" };
const PAGE = 25;
const views = [
  { key: "", label: "All" },
  { key: "sent", label: "Sent", states: ["SENT", "CONFIRMED"] },
  { key: "HELD", label: "Needs review", states: ["HELD"] },
  { key: "FAILED", label: "Failed", states: ["FAILED"] },
  { key: "CANCELLED", label: "Cancelled", states: ["CANCELLED"] },
] as const;
type Explanation = {
  explanation?: string;
  aiCallIds?: string[];
  suggested_rule_change?: {
    field: string;
    from: number;
    to: number;
    why?: string;
  };
} | null;
/** Whole days a held reward has waited. */
function waitedDays(created: Date, now = Date.now()) {
  return Math.floor((now - +created) / 86400000);
}
export default async function RewardsPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    view?: string;
    page?: string;
    q?: string;
  }>;
}) {
  const { merchant } = await requireMerchant(),
    query = await searchParams,
    exact = rewardStates.enumValues.find((s) => s === query.state),
    view =
      views.find(
        (v) => v.key === (query.view === "sent" ? "sent" : (exact ?? "")),
      ) ?? views[0],
    states: string[] | undefined = exact
      ? [exact]
      : "states" in view
        ? [...view.states]
        : undefined,
    q = (query.q ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 16),
    page = Math.max(1, Math.min(10000, Number(query.page) || 1)),
    db = getDb();
  const where: SQL[] = [eq(rewards.merchantId, merchant.id)];
  if (states)
    where.push(
      inArray(
        rewards.state,
        states as (typeof rewardStates.enumValues)[number][],
      ),
    );
  if (q)
    where.push(
      sql`lower(${rewards.customerKey}) like ${q.toLowerCase() + "%"}`,
    );
  const [counts, [{ total }], rows, queue] = await Promise.all([
    db
      .select({ state: rewards.state, n: sql<number>`count(*)::int` })
      .from(rewards)
      .where(eq(rewards.merchantId, merchant.id))
      .groupBy(rewards.state),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(rewards)
      .where(and(...where)),
    db
      .select({
        reward: rewards,
        date: visits.startedAt,
        flag: guardFlags,
        spec: programs.spec,
      })
      .from(rewards)
      .innerJoin(visits, eq(visits.id, rewards.visitId))
      .innerJoin(programs, eq(programs.id, rewards.programId))
      .leftJoin(
        guardFlags,
        and(
          eq(guardFlags.rewardId, rewards.id),
          eq(guardFlags.merchantId, merchant.id),
        ),
      )
      .where(and(...where))
      .orderBy(desc(rewards.createdAt), rewards.id)
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db
      .select({
        reward: rewards,
        flag: guardFlags,
        spec: programs.spec,
        visit: { startedAt: visits.startedAt, amountCents: visits.amountCents },
        customer: {
          firstSeen: customers.firstSeen,
          wallets: customers.wallets,
        },
      })
      .from(rewards)
      .innerJoin(
        guardFlags,
        and(
          eq(guardFlags.rewardId, rewards.id),
          eq(guardFlags.merchantId, merchant.id),
        ),
      )
      .innerJoin(visits, eq(visits.id, rewards.visitId))
      .innerJoin(programs, eq(programs.id, rewards.programId))
      .leftJoin(
        customers,
        and(
          eq(customers.merchantId, rewards.merchantId),
          eq(customers.key, rewards.customerKey),
        ),
      )
      .where(
        and(
          eq(rewards.merchantId, merchant.id),
          eq(rewards.state, "HELD"),
          eq(rewards.reason, "REVIEW"),
          eq(guardFlags.decision, "PENDING"),
        ),
      )
      .orderBy(asc(rewards.createdAt))
      .limit(20),
  ]);
  const merged = queue.length
    ? await db
        .select({
          id: captures.id,
          visitId: captures.visitId,
          amountCents: captures.amountCents,
          capturedAt: captures.capturedAt,
          wallet: captures.wallet,
        })
        .from(captures)
        .where(
          and(
            eq(captures.merchantId, merchant.id),
            inArray(
              captures.visitId,
              queue.map((r) => r.reward.visitId),
            ),
          ),
        )
        .orderBy(asc(captures.capturedAt))
    : [];
  const count = new Map(counts.map((c) => [c.state, c.n]));
  const viewCount = (v: (typeof views)[number]) =>
    "states" in v
      ? v.states.reduce((s, st) => s + (count.get(st) ?? 0), 0)
      : counts.reduce((s, c) => s + c.n, 0);
  const href = (params: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (v !== undefined && v !== "") sp.set(k, String(v));
    const s = sp.toString();
    return `/m/rewards${s ? `?${s}` : ""}`;
  };
  const viewParams = (key: string) =>
    key === "sent" ? { view: "sent" } : { state: key || undefined };
  const currentParams = {
    ...viewParams(exact ?? (view.key === "sent" ? "sent" : "")),
    q: q || undefined,
  };
  const year = new Date().getUTCFullYear();
  const ai = !(await aiBlocker(merchant));
  const start = (page - 1) * PAGE;
  return (
    <>
      <PageHeader
        title="Rewards"
        sub="Every reward is a partial refund of the qualifying payment, sent from your PayPal account."
        actions={
          <>
            <Link href="/m/help#taxes" className="btn btn-ghost">
              How rewards show in your taxes
            </Link>
            <form
              action="/api/m/rewards.csv"
              method="get"
              className="flex items-center gap-2"
            >
              <label htmlFor="csv-year" className="sr-only">
                Tax year
              </label>
              <select
                id="csv-year"
                name="year"
                className="select"
                defaultValue={year}
                style={{ width: 104 }}
              >
                {[year, year - 1, year - 2].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary">
                <Icon name="download" size={16} />
                Export CSV
              </button>
            </form>
          </>
        }
      />

      {!!queue.length && (
        <Section
          title={`Waiting for your review · ${queue.length}`}
          id="review"
        >
          {queue.map(({ reward: r, flag, spec, visit, customer }) => {
            const amount = r.amountCents - r.offsetAppliedCents;
            const explanation = flag.explanation as Explanation;
            const payments = merged.filter((c) => c.visitId === r.visitId);
            const waited = waitedDays(r.createdAt);
            return (
              <article
                key={r.id}
                className="card card-warn card-pad grid gap-6"
                style={{
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
                }}
                aria-labelledby={`review-${r.id}`}
              >
                <div className="flex min-w-0 flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip tone="warn" label="Needs review" size="sm" />
                    <span className="caption" style={{ fontSize: 13 }}>
                      Held {when(r.createdAt, merchant.tz)}
                      {waited > 0 &&
                        ` · waiting ${waited} day${waited === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <h3
                      id={`review-${r.id}`}
                      className="display num"
                      style={{ fontSize: 24 }}
                    >
                      {money(amount)} for{" "}
                      <span className="mono">
                        {customerCode(r.customerKey)}
                      </span>
                    </h3>
                    <p className="caption" style={{ fontSize: 13.5 }}>
                      {rewardKind(r.kind, spec as ProgramSpec)} · visit{" "}
                      {when(visit.startedAt, merchant.tz)} ·{" "}
                      {money(visit.amountCents)}
                      {customer &&
                        ` · ${customer.wallets.map(wallet).join(" and ") || "wallet unknown"} · first seen ${when(customer.firstSeen, merchant.tz)}`}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        Risk score
                      </span>
                      <span
                        className="num"
                        style={{ fontSize: 14, fontWeight: 600 }}
                      >
                        {flag.score} of 100 · {guardTier(flag.tier)}
                      </span>
                    </div>
                    <Meter
                      value={flag.score}
                      max={100}
                      guideline={30}
                      limit={60}
                      label={`Risk score ${flag.score} of 100. 0 to 29 is sent right away, 30 to 59 waits 24 hours, 60 and above needs you.`}
                      labels={[
                        { at: 0, text: "Sent right away" },
                        { at: 30, text: "Waits 24 h" },
                        { at: 60, text: "Needs you" },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <h4 style={{ fontSize: 14, fontWeight: 600 }}>
                      Why it was held
                    </h4>
                    {flag.reasons.length ? (
                      <ul className="flex flex-col gap-1.5">
                        {flag.reasons.map((reason) => (
                          <li
                            key={reason}
                            className="flex gap-2.5"
                            style={{ fontSize: 14, lineHeight: 1.5 }}
                          >
                            <span
                              className="num flex-none"
                              style={{
                                minWidth: 34,
                                fontWeight: 700,
                                color: "var(--warn)",
                              }}
                            >
                              {guardReasonPoints(reason) !== undefined
                                ? `+${guardReasonPoints(reason)}`
                                : "•"}
                            </span>
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-2" style={{ fontSize: 14 }}>
                        Your settings send this kind of reward to review.
                      </p>
                    )}
                  </div>
                  {explanation?.explanation ? (
                    <div
                      className="card-tint flex flex-col gap-1.5"
                      style={{ borderRadius: 12, padding: "12px 14px" }}
                    >
                      <span
                        className="eyebrow"
                        style={{ color: "var(--forest)" }}
                      >
                        {explanation.aiCallIds?.length
                          ? "AI explanation, checked against these signals"
                          : "Guard's signals in plain words"}
                      </span>
                      <p style={{ fontSize: 14, lineHeight: 1.55 }}>
                        {explanation.explanation}
                      </p>
                      {explanation.suggested_rule_change && (
                        <Link
                          href={`/m/program?rule=${flag.id}`}
                          style={{ fontSize: 14, fontWeight: 600 }}
                        >
                          Review the suggested rule change
                        </Link>
                      )}
                    </div>
                  ) : (
                    ai && (
                      <DemoLock>
                        <form action={explainReview}>
                          <input
                            type="hidden"
                            name="merchantId"
                            value={merchant.id}
                          />
                          <input type="hidden" name="rewardId" value={r.id} />
                          <SubmitButton
                            className="btn btn-tint btn-sm"
                            pendingLabel="Explaining…"
                          >
                            <Icon name="sparkles" size={14} />
                            Explain in plain words
                          </SubmitButton>
                        </form>
                      </DemoLock>
                    )
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <h4 style={{ fontSize: 14, fontWeight: 600 }}>
                      {payments.length > 1
                        ? `${payments.length} payments merged into this visit`
                        : "Payment for this visit"}
                    </h4>
                    <ul
                      className="flex flex-col"
                      style={{
                        border: "1px solid var(--line)",
                        borderRadius: 12,
                      }}
                    >
                      {payments.map((c, i) => (
                        <li
                          key={c.id}
                          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
                          style={{
                            padding: "9px 12px",
                            borderTop: i ? "1px solid var(--line)" : undefined,
                            fontSize: 13.5,
                          }}
                        >
                          <span className="num">
                            {when(c.capturedAt, merchant.tz)}
                          </span>
                          <span
                            className="mono caption"
                            style={{ fontSize: 12.5 }}
                          >
                            {c.id}
                          </span>
                          <span className="num" style={{ fontWeight: 600 }}>
                            {money(c.amountCents)} · {wallet(c.wallet)}
                          </span>
                        </li>
                      ))}
                      {!payments.length && (
                        <li className="caption" style={{ padding: "9px 12px" }}>
                          No payment details are stored for this visit.
                        </li>
                      )}
                    </ul>
                  </div>
                  <DemoLock>
                    <ReviewControls
                      merchantId={merchant.id}
                      rewardId={r.id}
                      amountCents={amount}
                    />
                  </DemoLock>
                </div>
              </article>
            );
          })}
        </Section>
      )}

      <Section title="All rewards" id="all">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Filter rewards" className="seg">
            {views.map((v) => (
              <Link
                key={v.key}
                href={href({ ...viewParams(v.key), q: q || undefined })}
                className="seg-item"
                aria-current={v.key === view.key ? "page" : undefined}
              >
                {v.label}
                <span className="seg-count">{viewCount(v)}</span>
              </Link>
            ))}
          </nav>
          <form method="get" className="flex items-center gap-2" role="search">
            {exact && <input type="hidden" name="state" value={exact} />}
            {view.key === "sent" && (
              <input type="hidden" name="view" value="sent" />
            )}
            <label htmlFor="reward-search" className="sr-only">
              Find a customer code
            </label>
            <input
              id="reward-search"
              name="q"
              className="input"
              placeholder="Customer code, e.g. A1B2"
              defaultValue={q}
              style={{ width: 220 }}
            />
            <button type="submit" className="btn btn-secondary">
              <Icon name="search" size={16} />
              Find
            </button>
          </form>
        </div>
        {exact && !views.some((v) => v.key === exact) && (
          <p className="caption" style={{ fontSize: 14 }}>
            Showing {rewardState(exact).label.toLowerCase()} rewards.{" "}
            <Link href={href({ q: q || undefined })}>Show all</Link>
          </p>
        )}
        <div className="card table-wrap">
          {rows.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Visit</th>
                  <th scope="col">Customer</th>
                  <th scope="col" className="right">
                    Reward
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Risk</th>
                  <th scope="col">PayPal refund ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ reward: r, date, flag, spec }) => {
                  const status = rewardState(r.state);
                  // The status chip already says a held reward is waiting for review.
                  const reason =
                    r.reason === "REVIEW" ? "" : rewardReason(r.reason);
                  return (
                    <tr key={r.id}>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        {when(date, merchant.tz)}
                      </td>
                      <td className="mono">{customerCode(r.customerKey)}</td>
                      <td className="right">
                        <span className="num" style={{ fontWeight: 600 }}>
                          {money(r.amountCents - r.offsetAppliedCents)}
                        </span>
                        <br />
                        <span className="caption">
                          {rewardKind(r.kind, spec as ProgramSpec)}
                        </span>
                      </td>
                      <td>
                        <StatusChip
                          tone={status.tone}
                          label={status.label}
                          size="sm"
                        />
                        {reason && (
                          <>
                            <br />
                            <span className="caption">{reason}</span>
                          </>
                        )}
                      </td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        {flag ? (
                          <>
                            {flag.score} · {guardTier(flag.tier)}
                          </>
                        ) : (
                          <span className="caption">Not scored</span>
                        )}
                      </td>
                      <td>
                        {r.refundId ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="code">{r.refundId}</span>
                            <CopyButton
                              value={r.refundId}
                              label={`Copy refund ID ${r.refundId}`}
                            />
                          </span>
                        ) : (
                          <span className="caption">
                            {["CANCELLED", "OFFSET", "FAILED"].includes(r.state)
                              ? "Not sent"
                              : "Not sent yet"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <State
              icon="rewards"
              title={
                q || states ? "No rewards match this filter" : "No rewards yet"
              }
              as="h3"
            >
              <p>
                {q || states
                  ? "Try another filter or clear the search."
                  : "Rewards appear here when a customer completes a card."}
              </p>
            </State>
          )}
          {!!rows.length && (
            <div className="table-foot">
              <span className="num">
                {start + 1}–{start + rows.length} of {total}
              </span>
              <span className="flex gap-2">
                {page > 1 && (
                  <Link
                    className="btn btn-secondary btn-sm"
                    href={href({ ...currentParams, page: page - 1 })}
                  >
                    Previous
                  </Link>
                )}
                {start + rows.length < total && (
                  <Link
                    className="btn btn-secondary btn-sm"
                    href={href({ ...currentParams, page: page + 1 })}
                  >
                    Next
                  </Link>
                )}
              </span>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
