import { and, eq, desc, gte, or, sql, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { digests, merchants, visits, rewards, suggestions } from "@/db/schema";
import { loadMerchant } from "./merchants";
import { localDay } from "./engine/evaluate";
import { zonedMidnight } from "./studio/query";
import {
  cohortQuery,
  measurementSentence,
  cohortCaption,
} from "./studio/cohorts";
import { querySchema } from "./studio/query";
export type DigestBody = {
  rewardsPaid: number;
  costCents: number;
  newRegulars: number;
  lapsingRegulars: number;
  held: number;
  declined: number;
  busiestDay: string | null;
  suggestionId: string | null;
  includesDemoHistory: boolean;
  cohortSummary?: string;
};
export function digestWeek(now: Date, tz: string) {
  const day = localDay(now, tz),
    date = new Date(day + "T00:00Z"),
    weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((weekday + 6) % 7));
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: tz,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  return {
    weekStart: date.toISOString().slice(0, 10),
    due: weekday === 0 && hour >= 18,
  };
}
export function digestFacts(
  history: { customerKey: string; startedAt: Date; source: string }[],
  paid: {
    state: string;
    reason?: string | null;
    amountCents: number;
    offsetAppliedCents: number;
    sentAt: Date | null;
    createdAt: Date;
  }[],
  from: Date,
  now: Date,
  tz: string,
  earlierCounts = new Map<string, number>(),
): DigestBody {
  const people = new Map<string, typeof history>();
  for (const v of history) {
    const a = people.get(v.customerKey) ?? [];
    a.push(v);
    people.set(v.customerKey, a);
  }
  let newRegulars = 0,
    lapsingRegulars = 0;
  const days = new Map<string, number>();
  for (const [key, rows] of people) {
    rows.sort((a, b) => +a.startedAt - +b.startedAt);
    const prior = earlierCounts.get(key) ?? 0;
    if (prior < 2 && rows[1 - prior]?.startedAt >= from) newRegulars++;
    if (
      rows.filter((v) => +v.startedAt >= +now - 90 * 86400000).length >= 3 &&
      +now - +rows.at(-1)!.startedAt > 30 * 86400000
    )
      lapsingRegulars++;
  }
  for (const v of history.filter((v) => v.startedAt >= from)) {
    const d = localDay(v.startedAt, tz);
    days.set(d, (days.get(d) ?? 0) + 1);
  }
  const sent = paid.filter(
    (r) =>
      ["SENT", "CONFIRMED"].includes(r.state) &&
      r.sentAt &&
      r.sentAt >= from &&
      r.sentAt <= now,
  );
  return {
    rewardsPaid: sent.length,
    costCents: sent.reduce(
      (s, r) => s + r.amountCents - r.offsetAppliedCents,
      0,
    ),
    newRegulars,
    lapsingRegulars,
    held: paid.filter((r) => r.state === "HELD" && r.createdAt >= from).length,
    declined: paid.filter(
      (r) =>
        r.state === "CANCELLED" &&
        r.reason === "DECLINED" &&
        r.createdAt >= from,
    ).length,
    busiestDay:
      [...days].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0] ?? null,
    suggestionId: null,
    includesDemoHistory: history.some((v) => v.source === "REPLAY"),
  };
}
export function digestText(d: DigestBody) {
  return `${d.rewardsPaid} rewards sent ($${(d.costCents / 100).toFixed(2)}). ${d.newRegulars} new regulars; ${d.lapsingRegulars} lapsing regulars. ${d.held} held and ${d.declined} declined rewards. Busiest day: ${d.busiestDay ?? "no visits"}.${d.includesDemoHistory ? " Includes replay demo history." : ""}${d.cohortSummary ? " " + d.cohortSummary : ""}`;
}
export async function weeklyDigests(
  deadline = Date.now() + 45000,
  now = new Date(),
) {
  const businesses = await getDb()
    .select()
    .from(merchants)
    .where(eq(merchants.status, "ACTIVE"));
  let count = 0;
  for (const m of businesses) {
    if (Date.now() > deadline - 1000) break;
    const week = digestWeek(now, m.tz);
    if (!week.due || m.purgeAfter) continue;
    const [exists] = await getDb()
      .select()
      .from(digests)
      .where(
        and(
          eq(digests.merchantId, m.id),
          eq(digests.weekStart, week.weekStart),
        ),
      );
    if (exists) continue;
    const loaded = await loadMerchant(m.slug, true);
    if (!loaded) continue;
    const from = zonedMidnight(week.weekStart, m.tz),
      cutoff = new Date(+now - 90 * 86400000);
    const earlier = await getDb().execute(
      sql`select customer_key, count(*)::int n from visits where merchant_id=${m.id} and status='COMPLETED' and amount_cents>=${loaded.spec.minTicketCents} and source<>'FIXTURE' and started_at<${cutoff.toISOString()}::timestamptz group by customer_key`,
    );
    const earlierRows =
      (earlier as unknown as { rows?: { customer_key: string; n: number }[] })
        .rows ?? (Array.from(earlier) as { customer_key: string; n: number }[]);
    const history = await getDb()
      .select()
      .from(visits)
      .where(
        and(
          eq(visits.merchantId, m.id),
          eq(visits.status, "COMPLETED"),
          gte(visits.amountCents, loaded.spec.minTicketCents),
          gte(visits.startedAt, cutoff),
          lte(visits.startedAt, now),
        ),
      );
    const paid = await getDb()
        .select()
        .from(rewards)
        .where(
          and(
            eq(rewards.merchantId, m.id),
            or(gte(rewards.createdAt, from), gte(rewards.sentAt, from)),
          ),
        ),
      [idea] = await getDb()
        .select()
        .from(suggestions)
        .where(
          and(
            eq(suggestions.merchantId, m.id),
            eq(suggestions.status, "PENDING"),
          ),
        )
        .orderBy(desc(suggestions.createdAt))
        .limit(1);
    const body = digestFacts(
      history.filter((v) => v.source !== "FIXTURE" && v.startedAt <= now),
      paid,
      from,
      now,
      m.tz,
      new Map(earlierRows.map((r) => [r.customer_key, Number(r.n)])),
    );
    body.suggestionId = idea?.id ?? null;
    const { data: cohorts } = await cohortQuery(
      m,
      loaded.spec.minTicketCents,
      querySchema.parse({
        table: "cohorts",
        fields: [
          "cohorts.cohort_month",
          "cohorts.customers",
          "cohorts.returned_60",
          "cohorts.rate_60",
          "cohorts.period",
        ],
      }),
      now,
    );
    const month = localDay(now, m.tz).slice(0, 7),
      current = cohorts.find((r) => r.cohort_month === month),
      before = cohorts.filter((r) => r.period === "before");
    const beforeN = before.reduce((s, r) => s + Number(r.customers), 0),
      beforeReturns = before.reduce((s, r) => s + Number(r.returned_60), 0);
    body.cohortSummary = `Second-visit rate of this month's new customers: ${Number(current?.customers) > 0 ? Math.round(Number(current?.rate_60) * 100) + "%" : "unavailable"} (60-day; follow-up incomplete); before the program: ${beforeN ? Math.round((beforeReturns / beforeN) * 100) + "%" : "unavailable"}. ${cohortCaption} ${await measurementSentence(m.id)}`;
    const inserted = await getDb()
      .insert(digests)
      .values({ merchantId: m.id, weekStart: week.weekStart, body })
      .onConflictDoNothing()
      .returning();
    count += inserted.length;
  }
  return count;
}
