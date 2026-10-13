import Link from "next/link";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  captures,
  connections,
  customers,
  merchants,
  merchantUsers,
  rewards,
  settings,
  visits,
} from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
import { loadMerchant } from "@/lib/merchants";
import { selectBusiness, toggleRewards } from "./actions";
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export default async function Dashboard() {
  const { user, merchant } = await requireMerchant(),
    db = getDb(),
    from = sql`now()-interval '30 days'`;
  const [
    businesses,
    [connection],
    loaded,
    [kpi],
    [paid],
    needs,
    pending,
    frozen,
    unreconciled,
  ] = await Promise.all([
    db
      .select({ id: merchants.id, name: merchants.displayName })
      .from(merchantUsers)
      .innerJoin(merchants, eq(merchants.id, merchantUsers.merchantId))
      .where(
        and(eq(merchantUsers.userId, user.id), eq(merchantUsers.role, "OWNER")),
      ),
    db
      .select()
      .from(connections)
      .where(eq(connections.merchantId, merchant.id)),
    loadMerchant(merchant.slug, true),
    db
      .select({
        visits: sql<number>`count(*)::int`,
        customers: sql<number>`count(distinct ${visits.customerKey})::int`,
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
  return (
    <>
      <div className="merchant-title">
        <h1>{merchant.displayName}</h1>
        {businesses.length > 1 && (
          <form action={selectBusiness}>
            <label>
              Business
              <select name="merchant" defaultValue={merchant.id}>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary">Switch</button>
          </form>
        )}
      </div>
      {merchant.onboardingStep !== "done" && (
        <p className="merchant-banner">
          <Link href="/m/onboarding">Continue setup</Link> · Next:{" "}
          {merchant.onboardingStep}
        </p>
      )}
      <div className="merchant-grid">
        <section className="merchant-card">
          <h2>PayPal connection</h2>
          <p>
            {connection?.mode ?? "Not connected"} ·{" "}
            {connection?.status ?? "Not connected"}
          </p>
          <p className="muted">
            Last check:{" "}
            {connection?.lastStatusCheckAt?.toLocaleString("en-US", {
              timeZone: merchant.tz,
            }) ?? "Pending"}
          </p>
          <Link href="/m/onboarding/connect">Manage connection</Link>
        </section>
        <section className="merchant-card">
          <h2>Reward program</h2>
          {loaded && (
            <>
              <p>
                {loaded.spec.type === "VISIT_MILESTONE"
                  ? `${loaded.spec.n} visits`
                  : `${money(loaded.spec.spendCents)} spent`}{" "}
                → {money(loaded.spec.rewardCents)} back ·{" "}
                {loaded.spec.windowDays} days
              </p>
              <p className="muted">
                Daily {money(loaded.spec.dailyBudgetCents)} · Monthly{" "}
                {money(loaded.spec.monthlyBudgetCents)} · Per customer/month{" "}
                {money(loaded.spec.perCustomerMonthlyCapCents)}
              </p>
            </>
          )}
          <p>
            {connection?.status !== "CONNECTED"
              ? "Rewards unavailable until PayPal is connected"
              : loaded?.program.status !== "ACTIVE"
                ? "Program not yet activated"
                : merchant.rewardsPaused
                  ? "Rewards paused"
                  : "Rewards enabled"}
          </p>
          <form action={toggleRewards}>
            <input name="merchantId" type="hidden" value={merchant.id} />
            <input
              name="paused"
              type="hidden"
              value={merchant.rewardsPaused ? "no" : "yes"}
            />
            <button
              disabled={
                connection?.status !== "CONNECTED" ||
                loaded?.program.status !== "ACTIVE"
              }
            >
              {merchant.rewardsPaused ? "Resume rewards" : "Pause rewards"}
            </button>
          </form>
          <Link href="/m/onboarding/program">Edit program</Link>
        </section>
      </div>
      <section className="merchant-card">
        <h2>Last 30 days</h2>
        <div className="kpi-grid">
          {[
            ["Visits", kpi.visits],
            ["Recognized customers", kpi.customers],
            ["Regulars (4+ visits)", regulars.length],
            ["Rewards sent", `${money(paid.cents)} (${paid.count})`],
            [
              "Rewards / visit",
              `${((100 * paid.count) / Math.max(1, kpi.visits)).toFixed(1)}%`,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="merchant-card">
        <h2>Existing regulars</h2>
        <p>
          {Number(merchant.stats.payments ?? 0)} payments ·{" "}
          {Number(merchant.stats.customers ?? 0)} recognized customers ·{" "}
          {Number(merchant.stats.regulars4 ?? 0)} regulars with 4+ visits in 60
          days · {Number(merchant.stats.unrecognizedPayments ?? 0)} unrecognized
          payments
        </p>
        <Link href="/m/onboarding/history">Read or review history</Link>
      </section>
      <section className="merchant-card">
        <h2>Needs attention</h2>
        {!needs.length &&
        !pending[0].count &&
        !frozen[0].count &&
        !unreconciled.length ? (
          <p>Nothing needs attention.</p>
        ) : (
          <ul>
            {needs.map((r) => (
              <li key={r.id}>
                <Link href={`/m/rewards?state=${r.state}`}>
                  {r.state}: {money(r.amountCents - r.offsetAppliedCents)} ·{" "}
                  {r.reason}
                </Link>
              </li>
            ))}
            {!!pending[0].count && (
              <li>{pending[0].count} captures pending more than 24 hours</li>
            )}
            {!!frozen[0].count && (
              <li>
                <Link href="/m/customers">
                  {frozen[0].count} customers frozen while a return or dispute
                  is reviewed
                </Link>
              </li>
            )}
            {!!unreconciled.length && (
              <li>
                Some sent rewards need reporting reconciliation. Their state is
                preserved.
              </li>
            )}
          </ul>
        )}
      </section>
      <p className="merchant-links">
        <Link href="/m/onboarding/menu">Sign & QR</Link>
        <Link href={`/pay/${merchant.slug}`}>Pay page</Link>
        <Link href={`/pay/${merchant.slug}/terms`}>Program terms</Link>
        <Link href="/privacy">Privacy</Link>
      </p>
    </>
  );
}
