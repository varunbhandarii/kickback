import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { Tx } from "@/db";
import { captures, historyEvents, merchants, visits } from "@/db/schema";
import type { Merchant } from "../merchants";
import { transactionFingerprint } from "./classify";
const quantile = (values: number[], p: number) => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted.length
    ? Math.round(sorted[Math.floor((sorted.length - 1) * p)])
    : 0;
};
export async function computeHistoryStats(
  tx: Tx,
  merchant: Merchant,
  now = new Date(),
) {
  const from = new Date(now.getTime() - 90 * 86400000),
    recent = new Date(now.getTime() - 60 * 86400000);
  const sales = await tx
    .select()
    .from(captures)
    .where(
      and(
        eq(captures.merchantId, merchant.id),
        inArray(captures.status, [
          "COMPLETED",
          "PARTIALLY_REFUNDED",
          "REFUNDED",
          "REVERSED",
        ]),
        gte(captures.capturedAt, from),
        lte(captures.capturedAt, now),
      ),
    );
  const events = await tx
    .select()
    .from(historyEvents)
    .where(
      and(
        eq(historyEvents.merchantId, merchant.id),
        inArray(historyEvents.kind, ["SALE", "UNRECOGNIZED"]),
        gte(historyEvents.occurredAt, from),
        lte(historyEvents.occurredAt, now),
      ),
    );
  const transactions = new Map<string, (typeof events)[number]>();
  for (const event of events) {
    const key = event.key.split(".")[0],
      old = transactions.get(key);
    if (!old || event.kind === "SALE") transactions.set(key, event);
  }
  const grouped = [...transactions.values()],
    unrecognized = grouped.filter((row) => row.kind === "UNRECOGNIZED"),
    reported = grouped.filter((row) => row.kind === "SALE");
  const unreported = sales.filter(
    (sale) => !transactions.has(transactionFingerprint(merchant.id, sale.id)),
  );
  const rows = await tx
    .select()
    .from(visits)
    .where(
      and(
        eq(visits.merchantId, merchant.id),
        eq(visits.status, "COMPLETED"),
        gte(visits.startedAt, recent),
        lte(visits.startedAt, now),
        gte(visits.amountCents, merchant.spec.minTicketCents),
      ),
    );
  const counts = new Map<string, number>(),
    dates = new Map<string, Date[]>();
  for (const visit of rows) {
    counts.set(visit.customerKey, (counts.get(visit.customerKey) ?? 0) + 1);
    const list = dates.get(visit.customerKey) ?? [];
    list.push(visit.startedAt);
    dates.set(visit.customerKey, list);
  }
  const gaps: number[] = [];
  for (const list of dates.values()) {
    list.sort((a, b) => +a - +b);
    for (let i = 1; i < list.length; i++)
      gaps.push((+list[i] - +list[i - 1]) / 86400000);
  }
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    weekdayMix = Array<number>(7).fill(0),
    hourMix = Array<number>(24).fill(0),
    walletMix = { PAYPAL: 0, VENMO: 0 };
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: merchant.tz,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  });
  for (const sale of sales) {
    walletMix[sale.wallet]++;
    const parts = formatter.formatToParts(sale.capturedAt);
    weekdayMix[
      weekdays.indexOf(parts.find((p) => p.type === "weekday")!.value)
    ]++;
    hourMix[Number(parts.find((p) => p.type === "hour")!.value)]++;
  }
  const recognized = sales.filter((s) => s.customerKey),
    people = new Set(
      [
        ...recognized.map((s) => s.customerKey),
        ...reported.map((s) => s.customerKey),
      ].filter(Boolean),
    ),
    ranked = [...counts.values()].sort((a, b) => b - a);
  const stats = {
    windowDays: 90,
    payments: reported.length + unreported.length + unrecognized.length,
    recognizedPayments:
      reported.filter((row) => row.customerKey).length +
      unreported.filter((sale) => sale.customerKey).length,
    unrecognizedPayments:
      unrecognized.length +
      unreported.filter((sale) => !sale.customerKey).length,
    customers: people.size,
    regulars4: ranked.filter((n) => n >= 4).length,
    regulars2: ranked.filter((n) => n >= 2).length,
    repeatShare: ranked.filter((n) => n >= 2).length / Math.max(1, people.size),
    ticketP50: quantile(
      sales.map((s) => s.amountCents),
      0.5,
    ),
    ticketP90: quantile(
      sales.map((s) => s.amountCents),
      0.9,
    ),
    interVisitDaysP50: quantile(gaps, 0.5),
    weekdayMix,
    hourMix,
    walletMix,
    top10PctVisitShare:
      ranked
        .slice(0, Math.ceil(ranked.length * 0.1))
        .reduce((s, n) => s + n, 0) / Math.max(1, rows.length),
    computedAt: now.toISOString(),
  };
  await tx
    .update(merchants)
    .set({ stats, statsUpdatedAt: now })
    .where(eq(merchants.id, merchant.id));
  return stats;
}
