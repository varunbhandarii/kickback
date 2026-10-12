import { loadProgram, type ProgramSpec } from "./program";
export type VisitView = { id: string; startedAt: Date; amountCents: number; status: "PENDING" | "COMPLETED" | "VOID"; customerKey?: string };
export type RewardView = { visitId: string; state: string; amountCents: number; createdAt: Date };
export type Budget = { dailyUsedCents: number; monthlyUsedCents: number; customerMonthlyUsedCents: number };
export type Block = "MONTHLY_CAP" | "DAILY_BUDGET" | "MONTHLY_BUDGET";
export type Progress = { type: ProgramSpec["type"]; current: number; target: number; rewardCents: number; windowDays: number; blocked?: Block };
export function localDay(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
const dayNumber = (date: Date, tz: string) => Date.parse(`${localDay(date,tz)}T00:00:00Z`)/86400000;
export function evaluate(input: ProgramSpec, visits: VisitView[], rewards: RewardView[], budget: Budget, now: Date, tz: string) {
  const spec = loadProgram(input), target = spec.type === "VISIT_MILESTONE" ? spec.n : spec.spendCents;
  const qualifying = visits.filter((v) => v.startedAt <= now)
    .toSorted((a,b) => a.startedAt.getTime()-b.startedAt.getTime() || a.id.localeCompare(b.id));
  const existing = new Set(rewards.map((r) => r.visitId));
  const intents: { visitId: string; amountCents: number; reason: string; basisVisitIds: string[] }[] = [];
  const consumed: { visitId: string; reason: Block; basisVisitIds: string[] }[] = [];
  let basis: string[] = [];
  let current = 0, anchor: Date | undefined, blocked: Block | undefined;
  let daily = budget.dailyUsedCents, monthly = budget.monthlyUsedCents, customer = budget.customerMonthlyUsedCents;
  for (const visit of qualifying) {
    // A consumed cycle remains a boundary when an earlier purchase is returned.
    if (existing.has(visit.id)) { current = 0; anchor = undefined; basis = []; continue; }
    if (visit.status !== "COMPLETED" || visit.amountCents < spec.minTicketCents) continue;
    if (anchor && dayNumber(visit.startedAt,tz)-dayNumber(anchor,tz) > spec.windowDays) { current = 0; anchor = undefined; basis = []; }
    anchor ??= visit.startedAt;
    basis.push(visit.id);
    current += spec.type === "VISIT_MILESTONE" ? 1 : visit.amountCents;
    if (current < target) continue;
    current = 0; anchor = undefined;
    const basisVisitIds = basis; basis = [];
    const reason: Block | undefined = customer+spec.rewardCents > spec.perCustomerMonthlyCapCents ? "MONTHLY_CAP" : daily+spec.rewardCents > spec.dailyBudgetCents ? "DAILY_BUDGET" : monthly+spec.rewardCents > spec.monthlyBudgetCents ? "MONTHLY_BUDGET" : undefined;
    if (reason) { blocked = reason; consumed.push({ visitId: visit.id, reason,basisVisitIds }); continue; }
    intents.push({ visitId: visit.id, amountCents: spec.rewardCents, reason: spec.type,basisVisitIds });
    daily += spec.rewardCents; monthly += spec.rewardCents; customer += spec.rewardCents;
  }
  if (anchor && dayNumber(now,tz)-dayNumber(anchor,tz) > spec.windowDays) current = 0;
  const progress: Progress = { type: spec.type, current, target, rewardCents: spec.rewardCents, windowDays: spec.windowDays, ...(blocked ? { blocked } : {}) };
  return { intents, consumed, progress };
}
export function simulate(spec: ProgramSpec, visits: VisitView[], tz = "America/New_York") {
  const paid: (RewardView & { customerKey: string })[] = [], histories = new Map<string,VisitView[]>(), earners = new Set<string>();
  for (const visit of visits.toSorted((a,b) => a.startedAt.getTime()-b.startedAt.getTime() || a.id.localeCompare(b.id))) {
    const key = visit.customerKey ?? "customer", history = histories.get(key) ?? [];
    history.push(visit); histories.set(key,history);
    const day = localDay(visit.startedAt,tz), month = day.slice(0,7), sum = (rows: RewardView[]) => rows.reduce((s,r) => s+r.amountCents,0);
    const budget = { dailyUsedCents: sum(paid.filter((r) => localDay(r.createdAt,tz) === day)), monthlyUsedCents: sum(paid.filter((r) => localDay(r.createdAt,tz).startsWith(month))), customerMonthlyUsedCents: sum(paid.filter((r) => r.customerKey === key && localDay(r.createdAt,tz).startsWith(month))) };
    const result = evaluate(spec,history,paid.filter((r) => r.customerKey === key),budget,visit.startedAt,tz);
    for (const item of result.intents) { paid.push({ ...item, state: "CONFIRMED", createdAt: visit.startedAt, customerKey: key }); earners.add(key); }
    for (const item of result.consumed) paid.push({ ...item, amountCents: 0, state: "CANCELLED", createdAt: visit.startedAt, customerKey: key });
  }
  return { costCents: paid.reduce((sum,r) => sum+r.amountCents,0), earners: earners.size, rewards: paid.filter((r) => r.state === "CONFIRMED").length, refundCountRatio: paid.filter((r) => r.state === "CONFIRMED").length/Math.max(1,visits.filter((v) => v.status === "COMPLETED").length) };
}
