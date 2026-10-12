import { z } from "zod";
// Range limits are enforced locally after the model produces structured data.
export const ProgramCandidate = z.object({
  name: z.string(), type: z.enum(["VISIT_MILESTONE", "SPEND_MILESTONE"]),
  n: z.number().int().optional(), spend_cents: z.number().int().optional(),
  reward_cents: z.number().int(), window_days: z.number().int(), min_ticket_cents: z.number().int(),
  per_customer_monthly_cap_cents: z.number().int(), monthly_budget_cents: z.number().int(),
  rationale: z.string(), who_it_favors: z.enum(["light", "moderate", "heavy", "all"]),
});
export const ProgramCandidates = z.object({ candidates: z.array(ProgramCandidate) });
export function validateCandidates(input: unknown) {
  const parsed = ProgramCandidates.parse(input);
  if (parsed.candidates.length !== 3) throw new Error("Expected exactly three candidates");
  for (const c of parsed.candidates) {
    if (c.reward_cents < 1 || c.reward_cents > 1000 || c.window_days < 1 || c.window_days > 365 ||
        c.min_ticket_cents < 0 || c.monthly_budget_cents < c.reward_cents || c.monthly_budget_cents > 15000 ||
        c.per_customer_monthly_cap_cents < c.reward_cents || c.per_customer_monthly_cap_cents > c.monthly_budget_cents ||
        (c.type === "VISIT_MILESTONE" && (!c.n || c.n < 2 || c.n > 100)) ||
        (c.type === "SPEND_MILESTONE" && (!c.spend_cents || c.spend_cents < c.reward_cents || c.spend_cents > 1000000))) throw new Error("Candidate violates local budget or range constraints");
  }
  return parsed;
}
