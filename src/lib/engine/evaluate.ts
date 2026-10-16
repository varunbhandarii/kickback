import { loadProgram, type ProgramSpec } from "./program";
export type VisitView = {
  id: string;
  startedAt: Date;
  amountCents: number;
  status: "PENDING" | "COMPLETED" | "VOID";
  customerKey?: string;
  source?: string;
};
export type RewardView = {
  visitId: string;
  state: string;
  amountCents: number;
  createdAt: Date;
  kind?: string;
  reason?: string | null;
};
export type Budget = {
  dailyUsedCents: number;
  monthlyUsedCents: number;
  customerMonthlyUsedCents: number;
};
export type Block = "MONTHLY_CAP" | "DAILY_BUDGET" | "MONTHLY_BUDGET";
export type Progress = {
  type: ProgramSpec["type"];
  current: number;
  target: number;
  rewardCents: number;
  windowDays: number;
  blocked?: Block;
};
export function localDay(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
const dayNumber = (date: Date, tz: string) =>
  Date.parse(`${localDay(date, tz)}T00:00:00Z`) / 86400000;
export function evaluate(
  input: ProgramSpec,
  visits: VisitView[],
  rewards: RewardView[],
  budget: Budget,
  now: Date,
  tz: string,
  options?: { rewardableFrom?: Date; includeFixtures?: boolean },
) {
  const spec = loadProgram(input),
    target = spec.type === "VISIT_MILESTONE" ? spec.n : spec.spendCents;
  const qualifying = visits
    .filter(
      (v) =>
        v.startedAt <= now &&
        (options?.includeFixtures || v.source !== "FIXTURE"),
    )
    .toSorted(
      (a, b) =>
        a.startedAt.getTime() - b.startedAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  const existing = new Set(rewards.map((r) => r.visitId));
  const regularExisting = new Set(
    rewards
      .filter((r) => r.kind !== "WIN_BACK" && r.reason !== "WIN_BACK")
      .map((r) => r.visitId),
  );
  const winBackDates = rewards
    .filter((r) => r.kind === "WIN_BACK" || r.reason === "WIN_BACK")
    .map((r) => r.createdAt);
  let priorCompleted: VisitView[] = [];
  let lastCompleted: VisitView | undefined;
  const intents: {
    visitId: string;
    amountCents: number;
    reason: string;
    basisVisitIds: string[];
    kind?: "WIN_BACK";
  }[] = [];
  const consumed: {
    visitId: string;
    reason: Block | "BEFORE_PROGRAM_START";
    basisVisitIds: string[];
    kind?: "WIN_BACK";
  }[] = [];
  let basis: string[] = [];
  let current =
      spec.type === "VISIT_MILESTONE" && !rewards.length
        ? (spec.endowedProgress ?? 0)
        : 0,
    anchor: Date | undefined,
    blocked: Block | undefined;
  let daily = budget.dailyUsedCents,
    monthly = budget.monthlyUsedCents,
    customer = budget.customerMonthlyUsedCents;
  for (const visit of qualifying) {
    // A consumed cycle remains a boundary when an earlier purchase is returned.
    const before = priorCompleted;
    const previousCompleted = lastCompleted;
    if (visit.status === "COMPLETED") lastCompleted = visit;
    const qualifies =
      visit.status === "COMPLETED" && visit.amountCents >= spec.minTicketCents;
    if (qualifies) priorCompleted = [...priorCompleted, visit];
    if (regularExisting.has(visit.id)) {
      current = 0;
      anchor = undefined;
      basis = [];
      continue;
    }
    if (visit.status !== "COMPLETED" || visit.amountCents < spec.minTicketCents)
      continue;
    if (
      anchor &&
      dayNumber(visit.startedAt, tz) - dayNumber(anchor, tz) > spec.windowDays
    ) {
      current = 0;
      anchor = undefined;
      basis = [];
    }
    anchor ??= visit.startedAt;
    basis.push(visit.id);
    current += spec.type === "VISIT_MILESTONE" ? 1 : visit.amountCents;
    const regular = current >= target;
    const winBack =
      !regular &&
      !existing.has(visit.id) &&
      spec.winBack &&
      before.length >= spec.winBack.minVisits &&
      dayNumber(visit.startedAt, tz) -
        dayNumber(previousCompleted!.startedAt, tz) >=
        spec.winBack.gapDays &&
      !winBackDates.some(
        (d) =>
          d <= visit.startedAt &&
          dayNumber(visit.startedAt, tz) - dayNumber(d, tz) < 180,
      ) &&
      (options?.includeFixtures ||
        !["BACKFILL", "FIXTURE"].includes(visit.source ?? ""));
    if (!regular && !winBack) continue;
    if (existing.has(visit.id)) {
      if (regular) {
        current = 0;
        anchor = undefined;
        basis = [];
      }
      continue;
    }
    const amountCents = regular ? spec.rewardCents : spec.winBack!.rewardCents;
    const basisVisitIds = regular ? basis : [visit.id];
    if (regular) {
      current = 0;
      anchor = undefined;
      basis = [];
    } else winBackDates.push(visit.startedAt);
    if (options?.rewardableFrom && visit.startedAt < options.rewardableFrom) {
      consumed.push({
        visitId: visit.id,
        reason: "BEFORE_PROGRAM_START",
        basisVisitIds,
        ...(!regular ? { kind: "WIN_BACK" as const } : {}),
      });
      continue;
    }
    const reason: Block | undefined =
      customer + amountCents > spec.perCustomerMonthlyCapCents
        ? "MONTHLY_CAP"
        : daily + amountCents > spec.dailyBudgetCents
          ? "DAILY_BUDGET"
          : monthly + amountCents > spec.monthlyBudgetCents
            ? "MONTHLY_BUDGET"
            : undefined;
    if (reason) {
      blocked = reason;
      consumed.push({
        visitId: visit.id,
        reason,
        basisVisitIds,
        ...(!regular ? { kind: "WIN_BACK" as const } : {}),
      });
      continue;
    }
    intents.push({
      visitId: visit.id,
      amountCents,
      reason: regular ? spec.type : "WIN_BACK",
      basisVisitIds,
      ...(!regular ? { kind: "WIN_BACK" as const } : {}),
    });
    daily += amountCents;
    monthly += amountCents;
    customer += amountCents;
  }
  if (anchor && dayNumber(now, tz) - dayNumber(anchor, tz) > spec.windowDays)
    current = 0;
  const progress: Progress = {
    type: spec.type,
    current,
    target,
    rewardCents: spec.rewardCents,
    windowDays: spec.windowDays,
    ...(blocked ? { blocked } : {}),
  };
  return { intents, consumed, progress };
}
export { simulate } from "./simulate";
