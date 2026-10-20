import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { digests } from "@/db/schema";
import type { DigestBody } from "@/lib/digests";
import { money } from "@/lib/format";
export default async function DigestCard({
  merchantId,
}: {
  merchantId: string;
}) {
  const [row] = await getDb()
    .select()
    .from(digests)
    .where(eq(digests.merchantId, merchantId))
    .orderBy(desc(digests.createdAt))
    .limit(1);
  if (!row) return null;
  const body = row.body as DigestBody;
  const week = new Date(`${row.weekStart}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const facts: [string, string][] = [
    ["Rewards sent", `${body.rewardsPaid} · ${money(body.costCents)}`],
    ["New regulars", String(body.newRegulars)],
    ["Going quiet", String(body.lapsingRegulars)],
    ["Busiest day", body.busiestDay ?? "No visits"],
  ];
  return (
    <section className="card card-pad flex flex-col gap-4" aria-labelledby="week-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="week-title" className="card-title">
          This week
        </h2>
        <span className="caption">Week of {week}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="caption">{label}</dt>
            <dd className="num" style={{ fontSize: 17, fontWeight: 600 }}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {(!!body.held || !!body.declined) && (
        <p className="caption" style={{ fontSize: 13.5 }}>
          {body.held} held for review and {body.declined} declined this week.
        </p>
      )}
      {body.cohortSummary && (
        <p className="text-2" style={{ fontSize: 14, lineHeight: 1.5 }}>
          {body.cohortSummary}
        </p>
      )}
      {body.includesDemoHistory && <p className="caption">Includes demo replay history.</p>}
      <Link href="/m/cockpit" prefetch={false} style={{ fontSize: 14, fontWeight: 600 }}>
        Open Cockpit
      </Link>
    </section>
  );
}
