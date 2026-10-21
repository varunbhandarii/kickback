export const metadata = { title: "Customers" };
import Link from "next/link";
import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "@/db";
import { customers, rewards, visits } from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
import type { Progress } from "@/lib/engine/evaluate";
import { staffAction } from "../actions";
import { Icon } from "@/components/icons";
import {
  MiniProgress,
  PageHeader,
  PunchRow,
  SpendBar,
  State,
  StatusChip,
} from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/form-controls";
import { customerCode, lastSeen, money, when } from "@/lib/format";
import { customerStatus, visitSource, wallet } from "@/lib/copy";
import { DemoLock } from "@/components/demo-lock";
const PAGE = 25;
const filters = [
  { key: "", label: "All" },
  { key: "close", label: "Close to a reward" },
  { key: "regulars", label: "Regulars" },
  { key: "paused", label: "Paused" },
  { key: "staff", label: "Staff" },
] as const;
export default async function CustomerPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    filter?: string;
    q?: string;
    demo?: string;
    customer?: string;
  }>;
}) {
  const { merchant } = await requireMerchant(),
    query = await searchParams,
    filter = filters.find((f) => f.key === query.filter) ?? filters[0],
    q = (query.q ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 16),
    page = Math.max(1, Math.min(10000, Number(query.page) || 1)),
    db = getDb();
  // Column names are written out because select lists leave interpolated columns unqualified,
  // which would bind them to the subquery's own table.
  const live = sql`exists (select 1 from "visits" v where v."merchant_id" = "customers"."merchant_id" and v."customer_key" = "customers"."key" and v."source" <> 'FIXTURE')`;
  const recentVisits = sql`(select count(*) from "visits" v where v."merchant_id" = "customers"."merchant_id" and v."customer_key" = "customers"."key" and v."status" = 'COMPLETED' and v."started_at" >= now() - interval '90 days')`;
  const [{ all, demoCount }] = await db
    .select({
      all: sql<number>`count(*)::int`,
      demoCount: sql<number>`(count(*) filter (where not ${live}))::int`,
    })
    .from(customers)
    .where(eq(customers.merchantId, merchant.id));
  // Demo customers stay out of the way once real ones exist; before that they are the only data.
  const showDemo =
    query.demo === "1" || (query.demo !== "0" && all === demoCount);
  const where: SQL[] = [eq(customers.merchantId, merchant.id)];
  if (!showDemo) where.push(live);
  if (q) where.push(sql`lower(${customers.key}) like ${q.toLowerCase() + "%"}`);
  if (filter.key === "close")
    where.push(
      eq(customers.status, "OK"),
      sql`coalesce((${customers.progress}->>'target')::numeric, 0) > 0`,
      sql`(${customers.progress}->>'current')::numeric / (${customers.progress}->>'target')::numeric >= 0.6`,
    );
  if (filter.key === "regulars") where.push(sql`${recentVisits} >= 4`);
  if (filter.key === "paused") where.push(eq(customers.status, "FROZEN"));
  if (filter.key === "staff")
    where.push(eq(customers.status, "EXCLUDED"), live);
  const [people, [{ total }]] = await Promise.all([
    db
      .select({
        ...getTableColumns(customers),
        demo: sql<boolean>`not ${live}`,
      })
      .from(customers)
      .where(and(...where))
      .orderBy(
        ...(filter.key === "close"
          ? [
              sql`(${customers.progress}->>'current')::numeric / (${customers.progress}->>'target')::numeric desc`,
            ]
          : []),
        desc(customers.lastSeen),
        customers.key,
      )
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(customers)
      .where(and(...where)),
  ]);
  const hidden = demoCount;
  const keys = people.map((p) => p.key);
  const [recent, held] = keys.length
    ? await Promise.all([
        db
          .select({
            key: visits.customerKey,
            n: sql<number>`count(*)::int`,
            cents: sql<number>`coalesce(sum(${visits.amountCents}),0)::int`,
          })
          .from(visits)
          .where(
            and(
              eq(visits.merchantId, merchant.id),
              inArray(visits.customerKey, keys),
              eq(visits.status, "COMPLETED"),
              sql`${visits.startedAt} >= now() - interval '90 days'`,
            ),
          )
          .groupBy(visits.customerKey),
        db
          .select({ key: rewards.customerKey })
          .from(rewards)
          .where(
            and(
              eq(rewards.merchantId, merchant.id),
              inArray(rewards.customerKey, keys),
              eq(rewards.state, "HELD"),
            ),
          )
          .groupBy(rewards.customerKey),
      ])
    : [[], []];
  const byKey = new Map(recent.map((r) => [r.key, r]));
  const inReview = new Set(held.map((h) => h.key));
  const selectedKey =
    query.customer && query.customer.length <= 128 ? query.customer : undefined;
  const [selected] = selectedKey
    ? await db
        .select({
          ...getTableColumns(customers),
          demo: sql<boolean>`not ${live}`,
        })
        .from(customers)
        .where(
          and(
            eq(customers.merchantId, merchant.id),
            eq(customers.key, selectedKey),
          ),
        )
    : [];
  const detail = selected
    ? await customerDetail(merchant.id, selected.key)
    : undefined;

  const href = (params: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({
      filter: filter.key || undefined,
      q: q || undefined,
      demo: showDemo ? "1" : query.demo === "0" ? "0" : undefined,
      ...params,
    }))
      if (v !== undefined && v !== "") sp.set(k, String(v));
    const s = sp.toString();
    return `/m/customers${s ? `?${s}` : ""}`;
  };
  const stats = merchant.stats as Record<string, unknown>;
  const start = (page - 1) * PAGE;
  return (
    <>
      <PageHeader
        title="Customers"
        sub="Customers appear as one-way codes that only work inside your business. Kickback never stores names, emails or phone numbers."
      />
      {Number(stats.payments ?? 0) > 0 && (
        <p className="caption" style={{ fontSize: 14 }}>
          From your PayPal history: {Number(stats.payments ?? 0)} payments,{" "}
          {Number(stats.customers ?? 0)} recognized customers,{" "}
          {Number(stats.regulars4 ?? 0)} regulars with 4 or more visits in 60
          days, {Number(stats.unrecognizedPayments ?? 0)} payments without a
          linked wallet.{" "}
          <Link href="/m/onboarding/history">Read history again</Link>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter customers" className="seg">
          {filters.map((f) => (
            <Link
              key={f.key}
              href={href({
                filter: f.key || undefined,
                page: undefined,
                customer: undefined,
              })}
              className="seg-item"
              aria-current={f.key === filter.key ? "page" : undefined}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form method="get" className="flex items-center gap-2" role="search">
          {filter.key && (
            <input type="hidden" name="filter" value={filter.key} />
          )}
          {(showDemo || query.demo === "0") && (
            <input type="hidden" name="demo" value={showDemo ? "1" : "0"} />
          )}
          <label htmlFor="customer-search" className="sr-only">
            Find a customer code
          </label>
          <input
            id="customer-search"
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

      <div className={`detail-grid${detail ? " detail-grid-open" : ""}`}>
        <div className="card table-wrap">
          {people.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Card</th>
                  <th scope="col" className="right">
                    Visits, 90 days
                  </th>
                  <th scope="col" className="right">
                    Spent, 90 days
                  </th>
                  <th scope="col">Last visit</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const progress = p.progress as Progress;
                  const status = p.demo
                    ? { label: "Demo", tone: "demo" as const }
                    : inReview.has(p.key)
                      ? { label: "Reward in review", tone: "warn" as const }
                      : customerStatus(p.status);
                  const r = byKey.get(p.key);
                  return (
                    <tr
                      key={p.key}
                      data-selected={selected?.key === p.key || undefined}
                    >
                      <td>
                        <Link
                          href={href({ customer: p.key, page })}
                          className="mono"
                          style={{ fontWeight: 600 }}
                        >
                          {customerCode(p.key)}
                        </Link>
                        <br />
                        <span className="caption">
                          {p.wallets.map(wallet).join(", ") || "No wallet"}
                        </span>
                      </td>
                      <td>
                        {progress.target ? (
                          <MiniProgress
                            type={progress.type}
                            current={progress.current ?? 0}
                            target={progress.target}
                            rewardCents={progress.rewardCents}
                          />
                        ) : (
                          <span className="caption">Not started</span>
                        )}
                      </td>
                      <td className="right num">{r?.n ?? 0}</td>
                      <td className="right num">{money(r?.cents ?? 0)}</td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        {lastSeen(p.lastSeen, merchant.tz)}
                      </td>
                      <td>
                        <StatusChip
                          tone={status.tone}
                          label={status.label}
                          size="sm"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <State
              icon="customers"
              title={
                q || filter.key
                  ? "No customers match"
                  : "No recognized customers yet"
              }
              as="h2"
            >
              <p>
                {q || filter.key
                  ? "Try another filter or clear the search."
                  : "Customers appear after their first PayPal or Venmo payment on your pay page."}
              </p>
            </State>
          )}
          {!!people.length && (
            <div className="table-foot">
              <span className="num">
                {start + 1}–{start + people.length} of {total}
              </span>
              <span className="flex gap-2">
                {page > 1 && (
                  <Link
                    className="btn btn-secondary btn-sm"
                    href={href({ page: page - 1 })}
                  >
                    Previous
                  </Link>
                )}
                {start + people.length < total && (
                  <Link
                    className="btn btn-secondary btn-sm"
                    href={href({ page: page + 1 })}
                  >
                    Next
                  </Link>
                )}
              </span>
            </div>
          )}
        </div>

        {selected && detail && (
          <aside
            className="card card-pad flex flex-col gap-5"
            aria-labelledby="customer-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="customer-title"
                  className="display mono"
                  style={{ fontSize: 24 }}
                >
                  {customerCode(selected.key)}
                </h2>
                <p className="caption" style={{ fontSize: 13.5 }}>
                  {selected.wallets.map(wallet).join(" and ") || "No wallet"} ·
                  first seen {when(selected.firstSeen, merchant.tz)}
                </p>
              </div>
              <Link
                href={href({ customer: undefined, page })}
                className="icon-btn"
                aria-label="Close customer details"
              >
                <Icon name="x" size={16} />
              </Link>
            </div>
            {(() => {
              const p = selected.progress as Progress;
              if (!p.target) return null;
              return p.type === "SPEND_MILESTONE" ? (
                <SpendBar
                  current={p.current ?? 0}
                  target={p.target}
                  rewardCents={p.rewardCents}
                />
              ) : (
                <PunchRow
                  target={p.target}
                  filled={p.current ?? 0}
                  rewardCents={p.rewardCents}
                  size="sm"
                />
              );
            })()}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                ["Visits, 90 days", String(detail.visits90)],
                ["Spent, 90 days", money(detail.spent90)],
                [
                  "Rewards received",
                  `${detail.rewards.count} · ${money(detail.rewards.cents)}`,
                ],
                [
                  "Status",
                  selected.demo
                    ? "Demo"
                    : customerStatus(selected.status).label,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="caption">{label}</dt>
                  <dd className="num" style={{ fontWeight: 600 }}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-2">
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Recent visits</h3>
              {detail.recent.length ? (
                <ul
                  style={{ border: "1px solid var(--line)", borderRadius: 12 }}
                >
                  {detail.recent.map((v, i) => (
                    <li
                      key={v.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                      style={{
                        padding: "9px 12px",
                        borderTop: i ? "1px solid var(--line)" : undefined,
                        fontSize: 13.5,
                      }}
                    >
                      <span className="num">
                        {when(v.startedAt, merchant.tz)}
                      </span>
                      <span className="caption">
                        {visitSource(v.source)}
                        {v.payments > 1 && ` · ${v.payments} payments merged`}
                        {v.status !== "COMPLETED" &&
                          ` · ${v.status === "PENDING" ? "pending" : "not counted"}`}
                      </span>
                      <span className="num" style={{ fontWeight: 600 }}>
                        {money(v.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="caption">No visits recorded.</p>
              )}
            </div>
            {selected.demo ? (
              <p className="banner">
                Demo customer: synthetic history used for backtests. It never
                earns a refund.
              </p>
            ) : (
              <DemoLock>
                <form action={staffAction} className="flex flex-col gap-2">
                  <input name="merchantId" type="hidden" value={merchant.id} />
                  <input name="customer" type="hidden" value={selected.key} />
                  <input
                    name="excluded"
                    type="hidden"
                    value={selected.status === "EXCLUDED" ? "no" : "yes"}
                  />
                  {selected.status === "EXCLUDED" ? (
                    <SubmitButton className="btn btn-secondary">
                      Unmark as staff
                    </SubmitButton>
                  ) : (
                    <ConfirmButton
                      title={`Mark ${customerCode(selected.key)} as staff?`}
                      body={
                        <p>
                          Their purchases still go through, but they stop
                          earning rewards. Any reward waiting to be sent to them
                          is cancelled.
                        </p>
                      }
                      confirmLabel="Mark as staff"
                    >
                      Mark as staff
                    </ConfirmButton>
                  )}
                  <p className="caption" style={{ fontSize: 13 }}>
                    Staff purchases never earn rewards.
                  </p>
                </form>
              </DemoLock>
            )}
            <p className="caption" style={{ fontSize: 13 }}>
              Questions about this customer?{" "}
              <Link href="/m/cockpit" prefetch={false}>
                Ask the analyst in Cockpit
              </Link>{" "}
              and mention {customerCode(selected.key)}.
            </p>
          </aside>
        )}
      </div>

      {!showDemo && hidden > 0 && (
        <p className="caption" style={{ fontSize: 13.5 }}>
          {hidden} demo customer{hidden === 1 ? " is" : "s are"} hidden. Their
          visits are synthetic and never earn refunds.{" "}
          <Link href={href({ demo: "1", page: undefined })}>
            Show demo customers
          </Link>
        </p>
      )}
      {showDemo && hidden > 0 && (
        <p className="caption" style={{ fontSize: 13.5 }}>
          Demo customers are shown. Their visits are synthetic and never earn
          refunds.{" "}
          <Link
            href={href({ demo: "0", page: undefined, customer: undefined })}
          >
            Hide them
          </Link>
        </p>
      )}
    </>
  );
}

async function customerDetail(merchantId: string, key: string) {
  const db = getDb();
  const [recent, [agg], [paid]] = await Promise.all([
    db
      .select({
        id: visits.id,
        startedAt: visits.startedAt,
        amountCents: visits.amountCents,
        source: visits.source,
        status: visits.status,
        payments: sql<number>`(select count(*)::int from "captures" c where c."visit_id" = "visits"."id")`,
      })
      .from(visits)
      .where(
        and(eq(visits.merchantId, merchantId), eq(visits.customerKey, key)),
      )
      .orderBy(desc(visits.startedAt))
      .limit(8),
    db
      .select({
        n: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${visits.amountCents}),0)::int`,
      })
      .from(visits)
      .where(
        and(
          eq(visits.merchantId, merchantId),
          eq(visits.customerKey, key),
          eq(visits.status, "COMPLETED"),
          sql`${visits.startedAt} >= now() - interval '90 days'`,
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
          eq(rewards.merchantId, merchantId),
          eq(rewards.customerKey, key),
          inArray(rewards.state, ["SENT", "CONFIRMED"]),
        ),
      ),
  ]);
  return { recent, visits90: agg.n, spent90: agg.cents, rewards: paid };
}
