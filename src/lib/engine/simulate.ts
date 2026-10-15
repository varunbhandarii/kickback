import {
  evaluate,
  localDay,
  type VisitView,
  type RewardView,
} from "./evaluate";
import { loadProgram, type ProgramSpec } from "./program";
export type Metrics = {
  winBackRewards: number;
  winBackCostCents: number;
  costCents: number;
  costCents90: number;
  monthlyCostCents: number;
  rewards: number;
  earners: number;
  customers: number;
  shareReaching: number;
  medianDaysToFirstReward: number | null;
  refundCountRatio: number;
  gmvRatio: number;
  top10RewardShare: number;
  budgetBlocked: number;
  requiredLiftPct: number;
  breakEvenRevenuePerReward: number;
  demoShare: number;
  qualifyingVisits: number;
  qualifyingRevenueCents: number;
  dailyMeanCostCents: number;
};
export function quantile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = values.toSorted((a, b) => a - b),
    i = (sorted.length - 1) * p,
    lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}
export function simulate(
  input: ProgramSpec,
  visits: VisitView[],
  tz = "America/New_York",
  options: { windowStart?: Date; windowEnd?: Date; marginPct?: number } = {},
): Metrics {
  const spec = loadProgram(input),
    margin = (options.marginPct ?? 60) / 100;
  if (!Number.isFinite(margin) || margin <= 0 || margin > 1)
    throw new Error("Invalid margin");
  const end =
    options.windowEnd ??
    new Date(
      visits.length ? Math.max(...visits.map((v) => +v.startedAt)) : Date.now(),
    );
  const start = options.windowStart ?? new Date(+end - 90 * 86400000);
  const history = visits
    .filter(
      (v) =>
        v.status === "COMPLETED" &&
        v.amountCents >= spec.minTicketCents &&
        v.startedAt >= start &&
        v.startedAt <= end,
    )
    .toSorted(
      (a, b) => +a.startedAt - +b.startedAt || a.id.localeCompare(b.id),
    );
  const consumed: (RewardView & { customerKey: string })[] = [],
    byCustomer = new Map<string, VisitView[]>(),
    earners = new Set<string>(),
    first = new Map<string, number>(),
    firstReward = new Map<string, number>();
  let blocked = 0;
  for (const visit of history) {
    const key = visit.customerKey ?? "customer",
      rows = byCustomer.get(key) ?? [];
    rows.push(visit);
    byCustomer.set(key, rows);
    first.set(key, first.get(key) ?? +visit.startedAt);
    const day = localDay(visit.startedAt, tz),
      month = day.slice(0, 7);
    const sum = (filter: (r: (typeof consumed)[number]) => boolean) =>
      consumed.filter(filter).reduce((s, r) => s + r.amountCents, 0);
    const result = evaluate(
      spec,
      rows,
      consumed.filter((r) => r.customerKey === key),
      {
        dailyUsedCents: sum((r) => localDay(r.createdAt, tz) === day),
        monthlyUsedCents: sum((r) =>
          localDay(r.createdAt, tz).startsWith(month),
        ),
        customerMonthlyUsedCents: sum(
          (r) =>
            r.customerKey === key &&
            localDay(r.createdAt, tz).startsWith(month),
        ),
      },
      visit.startedAt,
      tz,
      { rewardableFrom: start, includeFixtures: true },
    );
    for (const item of result.intents) {
      consumed.push({
        ...item,
        state: "CONFIRMED",
        createdAt: visit.startedAt,
        customerKey: key,
      });
      earners.add(key);
      firstReward.set(key, firstReward.get(key) ?? +visit.startedAt);
    }
    for (const item of result.consumed) {
      consumed.push({
        ...item,
        amountCents: 0,
        state: "CANCELLED",
        createdAt: visit.startedAt,
        customerKey: key,
      });
      if (item.reason !== "BEFORE_PROGRAM_START") blocked++;
    }
  }
  const paid = consumed.filter((r) => r.state === "CONFIRMED"),
    cost = paid.reduce((s, r) => s + r.amountCents, 0);
  const top = new Set(
    [...byCustomer]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .slice(0, Math.ceil(byCustomer.size * 0.1))
      .map(([k]) => k),
  );
  const revenue = history.reduce((s, v) => s + v.amountCents, 0),
    gmvRatio = cost / Math.max(1, revenue);
  return {
    winBackRewards: paid.filter((r) => r.reason === "WIN_BACK").length,
    winBackCostCents: paid
      .filter((r) => r.reason === "WIN_BACK")
      .reduce((s, r) => s + r.amountCents, 0),
    costCents: cost,
    costCents90: cost,
    monthlyCostCents: Math.round(cost / 3),
    rewards: paid.length,
    earners: earners.size,
    customers: byCustomer.size,
    shareReaching: earners.size / Math.max(1, byCustomer.size),
    medianDaysToFirstReward: firstReward.size
      ? quantile(
          [...firstReward].map(
            ([key, at]) => (at - first.get(key)!) / 86400000,
          ),
          0.5,
        )
      : null,
    refundCountRatio: paid.length / Math.max(1, history.length),
    gmvRatio,
    top10RewardShare:
      paid
        .filter((r) => top.has(r.customerKey))
        .reduce((s, r) => s + r.amountCents, 0) / Math.max(1, cost),
    budgetBlocked: blocked,
    requiredLiftPct: (gmvRatio / margin) * 100,
    breakEvenRevenuePerReward: spec.rewardCents / margin,
    demoShare:
      history.filter((v) => v.source === "FIXTURE" || v.source === "REPLAY")
        .length / Math.max(1, history.length),
    qualifyingVisits: history.length,
    qualifyingRevenueCents: revenue,
    dailyMeanCostCents: cost / 90,
  };
}
export function metricWarnings(m: Metrics, category: string) {
  const warnings: string[] = [];
  if (m.gmvRatio > 0.03)
    warnings.push("Reward cost exceeds 3% of qualifying revenue.");
  if (m.refundCountRatio > 0.1)
    warnings.push("More than 10% of qualifying visits would receive a refund.");
  if (
    ["cafe", "bakery"].includes(category) &&
    (m.medianDaysToFirstReward ?? 0) > 30
  )
    warnings.push("The first reward takes more than 30 days.");
  if (m.top10RewardShare > 0.5)
    warnings.push("Over half of rewards go to the heaviest buyers.");
  if (m.shareReaching < 0.1)
    warnings.push("Few customers would reach a reward.");
  if (!m.qualifyingVisits)
    warnings.push("Not enough history for a reliable backtest.");
  return warnings;
}
export const metricsAcceptable = (m: Metrics) =>
  m.gmvRatio <= 0.05 && m.refundCountRatio <= 0.15;
