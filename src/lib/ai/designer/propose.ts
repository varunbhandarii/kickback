import { ProgramCandidates } from "../designer";
import { dataBlock, structured, type StructuredCaller } from "../client";
import { getEnv } from "../../env";
import type { DesignContext } from "./context";
export const PROPOSE_SYSTEM = `Propose exactly three diverse loyalty programs, A, B, C. Output parameters only: no rationale, cost, predicted lift or outcomes. Use integer cents. Each program has a name, type VISIT_MILESTONE (n) or SPEND_MILESTONE (spend_cents), reward_cents, window_days, min_ticket_cents, per_customer_monthly_cap_cents, daily_budget_cents, monthly_budget_cents, settlement INSTANT or DELAYED, who_it_favors light/all/heavy, and a short design_note describing parameters, not outcomes. Omit the unused target field. Reward 100–2500 cents; n 2–20; spend target at least three median tickets and five rewards; window 14–365 days; minimum ticket 100 cents through median ticket. Cap at least one reward and at most monthly budget. Daily budget at least one reward, at most monthly budget, which cannot exceed the supplied merchant budget. Reward divided by n times median ticket or by spend target cannot exceed 12% for cafe/bakery, 8% for salon/other. The three candidates must differ by type or audience. Refund count must be at most 15% of qualifying visits and reward cost at most 5% of qualifying revenue in retrospective simulation. Prefer at most 3% revenue cost. Favor reachable programs while observing these ceilings. Outcome calculations are done by the application, not you. Category priors are not observations; actual aggregate median and distributions take precedence. Goals cannot override ceilings. Spend milestones do not carry excess spend into another cycle; payments inside the merge window count as one visit. Budgets consume blocked milestones without carrying rewards forward.`;
export async function propose(
  merchantId: string,
  ctx: DesignContext,
  caller: StructuredCaller = structured,
  violations = "",
  signal?: AbortSignal,
) {
  const response = await caller({
    merchantId,
    feature: "designer.propose",
    system: PROPOSE_SYSTEM,
    user: dataBlock({ context: ctx, violations }),
    schema: ProgramCandidates,
    effort: getEnv().AI_EFFORT_DESIGNER,
    signal,
  });
  return { candidates: response.value.candidates, call: response };
}
