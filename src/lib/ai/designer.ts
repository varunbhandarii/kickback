import { z } from "zod";
import { defaultProgram, type ProgramSpec } from "../engine/program";
import type { DesignContext } from "./designer/context";
export const ProgramCandidate = z.strictObject({
  id: z.enum(["A", "B", "C"]),
  name: z.string().min(1).max(40),
  type: z.enum(["VISIT_MILESTONE", "SPEND_MILESTONE"]),
  n: z.number().int().optional(),
  spend_cents: z.number().int().optional(),
  reward_cents: z.number().int(),
  window_days: z.number().int(),
  min_ticket_cents: z.number().int(),
  per_customer_monthly_cap_cents: z.number().int(),
  daily_budget_cents: z.number().int(),
  monthly_budget_cents: z.number().int(),
  settlement: z.enum(["INSTANT", "DELAYED"]),
  who_it_favors: z.enum(["light", "all", "heavy"]),
  design_note: z.string().max(200),
});
export const ProgramCandidates = z.strictObject({
  candidates: z.array(ProgramCandidate).length(3),
});
export type Candidate = z.infer<typeof ProgramCandidate>;
export class CandidateValidationError extends Error {}
export function validateCandidates(
  value: unknown,
  ctx?: Pick<DesignContext, "budgetCents" | "category" | "ticketP50">,
) {
  const parsed = ProgramCandidates.parse(value),
    budget = ctx?.budgetCents ?? 15000,
    p50 = ctx?.ticketP50 ?? 600,
    maxRate = ["salon", "other"].includes(ctx?.category ?? "cafe")
      ? 0.08
      : 0.12,
    errors: string[] = [];
  if (new Set(parsed.candidates.map((c) => c.id)).size !== 3)
    errors.push("Use A, B and C exactly once");
  if (
    new Set(parsed.candidates.map((c) => c.type + ":" + c.who_it_favors))
      .size !== 3
  )
    errors.push("Candidates must differ by type or audience");
  for (const c of parsed.candidates) {
    const qualified =
      c.type === "VISIT_MILESTONE" ? (c.n ?? 0) * p50 : (c.spend_cents ?? 0);
    if (c.reward_cents < 100 || c.reward_cents > 2500)
      errors.push(c.id + ": reward must be 100–2500 cents");
    if (
      c.type === "VISIT_MILESTONE" &&
      (!c.n || c.n < 2 || c.n > 20 || c.spend_cents !== undefined)
    )
      errors.push(c.id + ": visit target must be 2–20; omit spend_cents");
    if (
      c.type === "SPEND_MILESTONE" &&
      (!c.spend_cents ||
        c.spend_cents < Math.max(3 * p50, 5 * c.reward_cents) ||
        c.n !== undefined)
    )
      errors.push(c.id + ": spend target too low; omit n");
    if (c.window_days < 14 || c.window_days > 365)
      errors.push(c.id + ": window must be 14–365");
    if (c.min_ticket_cents < 100 || c.min_ticket_cents > p50)
      errors.push(c.id + ": minimum must be 100 to median ticket");
    if (
      c.per_customer_monthly_cap_cents < c.reward_cents ||
      c.per_customer_monthly_cap_cents > c.monthly_budget_cents
    )
      errors.push(c.id + ": customer cap outside budget");
    if (
      c.daily_budget_cents < c.reward_cents ||
      c.daily_budget_cents > c.monthly_budget_cents ||
      c.monthly_budget_cents > budget ||
      c.monthly_budget_cents < c.reward_cents
    )
      errors.push(c.id + ": budget outside merchant ceiling");
    if (qualified <= 0 || c.reward_cents / qualified > maxRate)
      errors.push(c.id + ": reward exceeds qualifying-spend ceiling");
  }
  if (errors.length) throw new CandidateValidationError(errors.join("; "));
  return parsed;
}
export function candidateSpec(c: Candidate): ProgramSpec {
  const common = {
    ...defaultProgram,
    rewardCents: c.reward_cents,
    windowDays: c.window_days,
    minTicketCents: c.min_ticket_cents,
    perCustomerMonthlyCapCents: c.per_customer_monthly_cap_cents,
    dailyBudgetCents: c.daily_budget_cents,
    monthlyBudgetCents: c.monthly_budget_cents,
    settlement: c.settlement,
    noteTemplate:
      c.type === "VISIT_MILESTONE"
        ? "Thanks for {n} visits: a loyalty reward from {merchant}"
        : "Thanks for {n}: a loyalty reward from {merchant}",
  };
  return c.type === "VISIT_MILESTONE"
    ? { ...common, type: "VISIT_MILESTONE", n: c.n! }
    : { ...common, type: "SPEND_MILESTONE", spendCents: c.spend_cents! };
}
export function candidateFromSpec(
  spec: ProgramSpec,
  id: Candidate["id"] = "A",
  who: Candidate["who_it_favors"] = "all",
): Candidate {
  return {
    id,
    name: "Edited program",
    type: spec.type,
    ...(spec.type === "VISIT_MILESTONE"
      ? { n: spec.n - (spec.endowedProgress ?? 0) }
      : { spend_cents: spec.spendCents }),
    reward_cents: spec.rewardCents,
    window_days: spec.windowDays,
    min_ticket_cents: spec.minTicketCents,
    per_customer_monthly_cap_cents: spec.perCustomerMonthlyCapCents,
    daily_budget_cents: spec.dailyBudgetCents,
    monthly_budget_cents: spec.monthlyBudgetCents,
    settlement: spec.settlement === "REVIEW" ? "DELAYED" : spec.settlement,
    who_it_favors: who,
    design_note: "Merchant-edited parameters",
  };
}
export function fallbackCandidates(
  ctx: Pick<DesignContext, "category" | "ticketP50" | "budgetCents">,
) {
  const common = {
    reward_cents: 100,
    window_days: ctx.category === "salon" ? 270 : 90,
    min_ticket_cents: Math.min(
      ctx.ticketP50,
      Math.max(100, Math.floor(ctx.ticketP50 * 0.5)),
    ),
    per_customer_monthly_cap_cents: Math.min(ctx.budgetCents, 500),
    daily_budget_cents: Math.min(
      ctx.budgetCents,
      Math.max(100, Math.floor(ctx.budgetCents / 10)),
    ),
    monthly_budget_cents: ctx.budgetCents,
    settlement: "INSTANT" as const,
    design_note: "Conservative template; review the retrospective metrics.",
  };
  const candidates: Candidate[] = [
    {
      ...common,
      id: "A",
      name: "Steady visits",
      type: "VISIT_MILESTONE",
      n: Math.max(
        12,
        Math.ceil(
          100 /
            (ctx.ticketP50 *
              (["salon", "other"].includes(ctx.category) ? 0.08 : 0.12)),
        ),
      ),
      who_it_favors: "all",
    },
    {
      ...common,
      id: "B",
      name: "Purchase progress",
      type: "SPEND_MILESTONE",
      spend_cents: Math.max(1200, ctx.ticketP50 * 16),
      who_it_favors: "light",
    },
    {
      ...common,
      id: "C",
      name: "Frequent regulars",
      type: "VISIT_MILESTONE",
      n: 20,
      who_it_favors: "heavy",
    },
  ];
  return validateCandidates({ candidates }, ctx).candidates;
}
