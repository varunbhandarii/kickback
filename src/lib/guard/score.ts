export type GuardFeatures = {
  mergedCaptures: number;
  visitsToday: number;
  customerAgeDays: number;
  completedVisits: number;
  ticketCents: number;
  medianTicketCents: number;
  priorClawback: boolean;
  priorDeclinedOrHeld: boolean;
  rewardsLast7Days: number;
  minTicketCents: number;
  dayBudgetBurnCents: number;
  simulatedDailyMeanCents: number;
};
export function scoreGuard(
  f: GuardFeatures,
  floor: "INSTANT" | "DELAYED" | "REVIEW" = "INSTANT",
) {
  let score = 0;
  const reasons: string[] = [];
  const flag = (condition: boolean, points: number, reason: string) => {
    if (condition) {
      score += points;
      reasons.push(reason);
    }
  };
  flag(
    f.mergedCaptures >= 3,
    40,
    "Three or more payments merged into the qualifying visit.",
  );
  flag(f.visitsToday > 2, 25, "More than two visits today.");
  flag(
    f.customerAgeDays < 7 && f.completedVisits >= 3,
    20,
    "A new customer reached three visits in the first week.",
  );
  const multiple =
    f.medianTicketCents > 0 ? f.ticketCents / f.medianTicketCents : 0;
  flag(
    multiple > 3,
    multiple > 10 ? 30 : 15,
    multiple > 10
      ? "Ticket exceeds ten times the usual visit amount."
      : "Ticket exceeds three times the usual visit amount.",
  );
  flag(f.priorClawback, 30, "A previous reward has a clawback debit.");
  flag(f.priorDeclinedOrHeld, 10, "A previous reward was declined or held.");
  flag(
    f.rewardsLast7Days >= 2,
    20,
    "Two or more rewards in the last seven days.",
  );
  flag(
    f.ticketCents >= f.minTicketCents &&
      f.ticketCents <= f.minTicketCents * 1.1 &&
      f.visitsToday >= 2,
    15,
    "Repeated tickets are close to the qualifying minimum.",
  );
  flag(
    f.simulatedDailyMeanCents > 0 &&
      f.dayBudgetBurnCents > 2 * f.simulatedDailyMeanCents,
    15,
    "Daily rewards exceed twice the backtested daily mean.",
  );
  score = Math.min(100, score);
  let tier: "INSTANT" | "DELAYED" | "REVIEW" =
    score >= 60 ? "REVIEW" : score >= 30 ? "DELAYED" : "INSTANT";
  if (floor === "REVIEW") tier = "REVIEW";
  else if (floor === "DELAYED" && tier === "INSTANT") tier = "DELAYED";
  return { score, tier, reasons };
}
