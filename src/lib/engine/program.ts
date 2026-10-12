import { z } from "zod";
const cents = z.number().int().min(0).max(100_000_000);
const base = {
  rewardCents: cents.min(1).max(2500), windowDays: z.number().int().min(1).max(365), minTicketCents: cents.min(1),
  mergeWindowMin: z.number().int().min(30).max(240), perCustomerMonthlyCapCents: cents,
  dailyBudgetCents: cents, monthlyBudgetCents: cents,
  settlement: z.enum(["INSTANT", "DELAYED", "REVIEW"]), noteTemplate: z.string().min(1).max(255),
};
export const programSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("VISIT_MILESTONE"), n: z.number().int().min(2).max(100) }),
  z.object({ ...base, type: z.literal("SPEND_MILESTONE"), spendCents: cents.min(1) }),
]);
export type ProgramSpec = z.infer<typeof programSchema>;
export const loadProgram = (value: unknown) => programSchema.parse(value);
export const defaultProgram = { type: "VISIT_MILESTONE", n: 5, rewardCents: 200, windowDays: 60, minTicketCents: 300, mergeWindowMin: 120, perCustomerMonthlyCapCents: 1000, dailyBudgetCents: 5000, monthlyBudgetCents: 15000, settlement: "INSTANT", noteTemplate: "Thanks for {n} visits, this one's on {merchant}" } as const;
export function rewardNote(spec: ProgramSpec, merchant: string) {
  const note = spec.noteTemplate.replaceAll("{n}", spec.type === "VISIT_MILESTONE" ? String(spec.n) : `$${(spec.spendCents/100).toFixed(2)} spent`).replaceAll("{merchant}", merchant);
  if (note.length > 255 || /https?:\/\/|[\r\n]/i.test(note)) throw new Error("Invalid reward note");
  return note;
}
