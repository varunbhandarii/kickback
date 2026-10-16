export const metadata = { title: "Customers" };
import Link from "next/link";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, visits } from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
import { loadMerchant } from "@/lib/merchants";
import type { Progress } from "@/lib/engine/evaluate";
import { staffAction } from "../actions";
export default async function CustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { merchant } = await requireMerchant(),
    loaded = await loadMerchant(merchant.slug, true),
    query = await searchParams,
    page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const people = await getDb()
      .select()
      .from(customers)
      .where(eq(customers.merchantId, merchant.id))
      .orderBy(desc(customers.lastSeen), customers.key)
      .limit(101)
      .offset((page - 1) * 100),
    visible = people.slice(0, 100);
  const rows = visible.length
    ? await getDb()
        .select()
        .from(visits)
        .where(
          and(
            eq(visits.merchantId, merchant.id),
            inArray(
              visits.customerKey,
              visible.map((p) => p.key),
            ),
            eq(visits.status, "COMPLETED"),
            gte(
              visits.startedAt,
              sql`now()-(${loaded?.spec.windowDays ?? 60} * interval '1 day')`,
            ),
            gte(visits.amountCents, loaded?.spec.minTicketCents ?? 1),
          ),
        )
    : [];
  return (
    <>
      <h1>Customers</h1>
      <p className="muted">
        One-way customer codes stay within this business. Staff purchases do not
        receive rewards.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "Customer",
                "Wallets",
                "First / last seen",
                "Visits in window",
                "Progress",
                "Status",
                "Action",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const progress = p.progress as Progress;
              return (
                <tr key={p.key}>
                  <td>Regular #{p.key.slice(0, 4).toUpperCase()}</td>
                  <td>{p.wallets.join(", ")}</td>
                  <td>
                    {p.firstSeen.toLocaleDateString("en-US", {
                      timeZone: merchant.tz,
                    })}
                    <br />
                    {p.lastSeen.toLocaleDateString("en-US", {
                      timeZone: merchant.tz,
                    })}
                  </td>
                  <td>{rows.filter((v) => v.customerKey === p.key).length}</td>
                  <td>
                    {progress.type === "SPEND_MILESTONE"
                      ? `$${((progress.current ?? 0) / 100).toFixed(2)} / $${((progress.target ?? 0) / 100).toFixed(2)}`
                      : `${progress.current ?? 0} / ${progress.target ?? "—"}`}
                  </td>
                  <td>{p.status}</td>
                  <td>
                    <form action={staffAction}>
                      <input
                        name="merchantId"
                        type="hidden"
                        value={merchant.id}
                      />
                      <input name="customer" type="hidden" value={p.key} />
                      <input
                        name="excluded"
                        type="hidden"
                        value={p.status === "EXCLUDED" ? "no" : "yes"}
                      />
                      <button className="secondary">
                        {p.status === "EXCLUDED"
                          ? "Unmark staff"
                          : "Mark as staff"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!visible.length && <p>No recognized customers yet.</p>}
      <p>
        {page > 1 && (
          <Link href={`/m/customers?page=${page - 1}`}>Previous</Link>
        )}{" "}
        {people.length > 100 && (
          <Link href={`/m/customers?page=${page + 1}`}>Next</Link>
        )}
      </p>
    </>
  );
}
