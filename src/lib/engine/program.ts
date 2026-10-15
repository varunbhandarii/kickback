import { z } from "zod";
const cents = z.number().int().min(0).max(100_000_000);
const base = {
  rewardCents: cents.min(1).max(2500),
  windowDays: z.number().int().min(1).max(365),
  minTicketCents: cents.min(1),
  mergeWindowMin: z.number().int().min(30).max(240),
  perCustomerMonthlyCapCents: cents,
  dailyBudgetCents: cents,
  monthlyBudgetCents: cents,
  settlement: z.enum(["INSTANT", "DELAYED", "REVIEW"]),
  noteTemplate: z.string().min(1).max(255),
  noteVariants: z.array(z.string().min(1).max(120)).max(8).optional(),
  termsIntro: z.string().max(400).optional(),
  workedExamples: z.array(z.string().max(240)).max(2).optional(),
  signPitch: z.string().max(90).optional(),
  winBack: z
    .object({
      gapDays: z.union([
        z.literal(30),
        z.literal(45),
        z.literal(60),
        z.literal(90),
      ]),
      rewardCents: cents.min(100).max(1000),
      minVisits: z.number().int().min(3).max(100),
    })
    .optional(),
  welcomeBackNote: z.string().min(1).max(120).optional(),
};
export const programSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("VISIT_MILESTONE"),
    n: z.number().int().min(2).max(100),
    endowedProgress: z.number().int().min(0).max(18).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("SPEND_MILESTONE"),
    spendCents: cents.min(1),
  }),
]);
export type ProgramSpec = z.infer<typeof programSchema>;
export const loadProgram = (value: unknown) => {
  const spec = programSchema.parse(value);
  if (
    spec.winBack &&
    spec.winBack.rewardCents >
      Math.min(
        spec.rewardCents,
        spec.dailyBudgetCents,
        spec.monthlyBudgetCents,
        spec.perCustomerMonthlyCapCents,
      )
  )
    throw new Error(
      "Welcome-back reward cannot exceed the regular reward or budgets",
    );
  if (
    spec.type === "VISIT_MILESTONE" &&
    (spec.endowedProgress ?? 0) > spec.n - 2
  )
    throw new Error("At least two actual visits are required");
  return spec;
};
export const defaultProgram = {
  type: "VISIT_MILESTONE",
  n: 5,
  rewardCents: 200,
  windowDays: 60,
  minTicketCents: 300,
  mergeWindowMin: 120,
  perCustomerMonthlyCapCents: 1000,
  dailyBudgetCents: 5000,
  monthlyBudgetCents: 15000,
  settlement: "INSTANT",
  noteTemplate: "Thanks for {n} visits, this one's on {merchant}",
} as const;
export function rewardNote(
  spec: ProgramSpec,
  merchant: string,
  rewardId?: string,
  kind = "REGULAR",
) {
  const hash = rewardId
    ? [...rewardId].reduce(
        (h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0,
        2166136261,
      )
    : 0;
  const variant =
    rewardId && spec.noteVariants?.length
      ? spec.noteVariants[hash % spec.noteVariants.length]
      : undefined;
  const note = (
    kind === "WIN_BACK"
      ? (spec.welcomeBackNote ?? "Welcome back to {merchant}. Thank you!")
      : (variant ?? spec.noteTemplate)
  )
    .replaceAll(
      "{n}",
      spec.type === "VISIT_MILESTONE"
        ? String(spec.n)
        : `$${(spec.spendCents / 100).toFixed(2)} spent`,
    )
    .replaceAll("{merchant}", merchant);
  if (note.length > 255 || /https?:\/\/|[\r\n]/i.test(note))
    throw new Error("Invalid reward note");
  return note;
}
