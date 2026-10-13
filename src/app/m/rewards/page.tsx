import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { rewards, visits, rewardState } from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
export default async function RewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; page?: string }>;
}) {
  const { merchant } = await requireMerchant(),
    query = await searchParams,
    state = rewardState.enumValues.find((s) => s === query.state),
    page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const rows = await getDb()
    .select({ reward: rewards, date: visits.startedAt })
    .from(rewards)
    .innerJoin(visits, eq(visits.id, rewards.visitId))
    .where(
      and(
        eq(rewards.merchantId, merchant.id),
        ...(state ? [eq(rewards.state, state)] : []),
      ),
    )
    .orderBy(desc(rewards.createdAt), rewards.id)
    .limit(101)
    .offset((page - 1) * 100);
  return (
    <>
      <h1>Rewards</h1>
      <form method="get" className="filter-form">
        <label>
          State
          <select name="state" defaultValue={state ?? ""}>
            <option value="">All states</option>
            {rewardState.enumValues.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button className="secondary">Filter</button>
      </form>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {["State", "Amount", "Visit date", "Refund ID", "Reason"].map(
                (h) => (
                  <th key={h}>{h}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map(({ reward: r, date }) => (
              <tr key={r.id}>
                <td>{r.state}</td>
                <td>
                  ${((r.amountCents - r.offsetAppliedCents) / 100).toFixed(2)}
                </td>
                <td>
                  {date.toLocaleString("en-US", { timeZone: merchant.tz })}
                </td>
                <td>{r.refundId ?? "—"}</td>
                <td>{r.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>No rewards match this filter.</p>}
      <p>
        {page > 1 && (
          <Link href={`/m/rewards?page=${page - 1}&state=${state ?? ""}`}>
            Previous
          </Link>
        )}{" "}
        {rows.length > 100 && (
          <Link href={`/m/rewards?page=${page + 1}&state=${state ?? ""}`}>
            Next
          </Link>
        )}
      </p>
    </>
  );
}
