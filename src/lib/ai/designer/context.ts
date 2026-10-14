import { and, eq, gte } from "drizzle-orm";
import { getDb, type Tx } from "@/db";
import { captures, visits } from "@/db/schema";
import type { Merchant } from "../../merchants";
import type { VisitView } from "../../engine/evaluate";
import { quantile } from "../../engine/simulate";
export const categoryPriors = {
  cafe: {
    marginPct: 60,
    ticketCents: 600,
    visits: 8,
    windowDays: 60,
    rewardRateMax: 0.12,
    targetRate: 0.09,
  },
  bakery: {
    marginPct: 65,
    ticketCents: 1000,
    visits: 6,
    windowDays: 90,
    rewardRateMax: 0.12,
    targetRate: 0.08,
  },
  salon: {
    marginPct: 38,
    ticketCents: 4400,
    visits: 4,
    windowDays: 270,
    rewardRateMax: 0.08,
    targetRate: 0.05,
  },
  other: {
    marginPct: 35,
    ticketCents: 1500,
    visits: 8,
    windowDays: 90,
    rewardRateMax: 0.08,
    targetRate: 0.04,
  },
};
export const prior = (category: string) =>
  categoryPriors[category as keyof typeof categoryPriors] ??
  categoryPriors.other;
export type DesignInput = {
  goal: string;
  budgetCents: number;
  marginPct: number;
  liftAssumptionPct: number;
};
export type DesignContext = DesignInput & {
  category: string;
  windowStart: string;
  windowEnd: string;
  ticketP20: number;
  ticketP50: number;
  ticketP80: number;
  ticketP90: number;
  visitsPerCustomer: number[];
  interVisitGaps: number[];
  weekdayMix: number[];
  walletMix: { paypal: number; venmo: number };
  includesDemoHistory: boolean;
  demoShare: number;
  payments: number;
  customers: number;
  regulars: number;
  unrecognized: number;
  currentProgram: Record<string, unknown> | null;
  priors: ReturnType<typeof prior>;
};
export function buildContext(
  category: string,
  rows: VisitView[],
  input: DesignInput,
  now = new Date(),
  fallbackTicket = prior(category).ticketCents,
  stats: Record<string, unknown> = {},
  walletMix = { paypal: 0, venmo: 0 },
  currentProgram: Record<string, unknown> | null = null,
  tz = "America/New_York",
): DesignContext {
  const from = new Date(+now - 90 * 86400000),
    eligible = rows.filter(
      (v) =>
        v.status === "COMPLETED" &&
        v.amountCents >= 100 &&
        v.startedAt >= from &&
        v.startedAt <= now,
    );
  const tickets = eligible.map((v) => v.amountCents),
    groups = new Map<string, VisitView[]>(),
    counts = [0, 0, 0, 0, 0, 0],
    gaps = [0, 0, 0, 0, 0],
    weekdays = Array<number>(7).fill(0);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    });
  for (const v of eligible) {
    const k = v.customerKey ?? "unknown",
      group = groups.get(k) ?? [];
    group.push(v);
    groups.set(k, group);
    weekdays[weekday.indexOf(format.format(v.startedAt))]++;
  }
  for (const rows of groups.values()) {
    counts[
      rows.length <= 3
        ? rows.length - 1
        : rows.length <= 5
          ? 3
          : rows.length <= 9
            ? 4
            : 5
    ]++;
    const sorted = rows.toSorted((a, b) => +a.startedAt - +b.startedAt);
    for (let i = 1; i < sorted.length; i++) {
      const days = (+sorted[i].startedAt - +sorted[i - 1].startedAt) / 86400000;
      gaps[
        days <= 3 ? 0 : days <= 7 ? 1 : days <= 14 ? 2 : days <= 30 ? 3 : 4
      ]++;
    }
  }
  const demo = eligible.filter(
    (v) => v.source === "FIXTURE" || v.source === "REPLAY",
  ).length;
  return {
    ...input,
    category,
    windowStart: from.toISOString(),
    windowEnd: now.toISOString(),
    ticketP20: Math.round(quantile(tickets, 0.2) || fallbackTicket),
    ticketP50: Math.round(quantile(tickets, 0.5) || fallbackTicket),
    ticketP80: Math.round(quantile(tickets, 0.8) || fallbackTicket),
    ticketP90: Math.round(quantile(tickets, 0.9) || fallbackTicket),
    visitsPerCustomer: counts,
    interVisitGaps: gaps,
    weekdayMix: weekdays,
    walletMix,
    includesDemoHistory: demo > 0,
    demoShare: demo / Math.max(1, eligible.length),
    payments: eligible.length,
    customers: groups.size,
    regulars: [...groups.values()].filter((g) => g.length >= 4).length,
    unrecognized: Number(stats.unrecognizedPayments ?? 0),
    currentProgram,
    priors: prior(category),
  };
}
export async function designData(
  merchant: Merchant,
  input: DesignInput,
  now = new Date(),
  db: ReturnType<typeof getDb> | Tx = getDb(),
) {
  const rows = await db
    .select()
    .from(visits)
    .where(
      and(
        eq(visits.merchantId, merchant.id),
        eq(visits.status, "COMPLETED"),
        gte(visits.startedAt, new Date(+now - 90 * 86400000)),
        gte(visits.amountCents, merchant.spec.minTicketCents ?? 100),
      ),
    );
  const walletRows = await db
    .select({ wallet: captures.wallet })
    .from(captures)
    .where(
      and(
        eq(captures.merchantId, merchant.id),
        gte(captures.capturedAt, new Date(+now - 90 * 86400000)),
      ),
    );
  const spec = merchant.spec,
    currentProgram = {
      type: spec.type,
      n: spec.type === "VISIT_MILESTONE" ? spec.n : undefined,
      spendCents: spec.type === "SPEND_MILESTONE" ? spec.spendCents : undefined,
      rewardCents: spec.rewardCents,
      windowDays: spec.windowDays,
      minTicketCents: spec.minTicketCents,
      monthlyBudgetCents: spec.monthlyBudgetCents,
    };
  return {
    rows,
    context: buildContext(
      merchant.category,
      rows,
      input,
      now,
      merchant.menu[0]?.priceCents ?? prior(merchant.category).ticketCents,
      merchant.stats,
      {
        paypal: walletRows.filter((v) => v.wallet === "PAYPAL").length,
        venmo: walletRows.filter((v) => v.wallet === "VENMO").length,
      },
      currentProgram,
      merchant.tz,
    ),
  };
}
