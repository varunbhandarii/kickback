import type { AgStudioApi, AgAiToolContext } from "ag-studio";
import { defaultProgram } from "../engine/program";
const dollars = (v: unknown) => `$${(Number(v ?? 0) / 100).toFixed(2)}`;
export function summarizeTool(name: string, data: unknown): string {
  const d = data as Record<string, unknown>;
  let text = JSON.stringify(data);
  if (name === "program_metrics")
    text = `Payments ${d.payments}; rewards paid ${d.rewardsPaid} (${dollars(d.costCents)}); refund-count ratio ${(Number(d.refundCountRatio) * 100).toFixed(2)}%; cost/revenue ${(Number(d.gmvRatio) * 100).toFixed(2)}%; earners ${d.earners}; pending reviews ${d.pendingReviews}.`;
  if (name === "simulate_rules")
    text = `90-day retrospective: monthly cost ${dollars(d.monthlyCostCents)}, earners ${d.earners}/${d.customers}, share reaching ${(Number(d.shareReaching) * 100).toFixed(2)}%, first reward ${d.medianDaysToFirstReward ?? "unavailable"} days, refund-count ratio ${(Number(d.refundCountRatio) * 100).toFixed(2)}%, cost/revenue ${(Number(d.gmvRatio) * 100).toFixed(2)}%, share of rewards to the top 10% of customers by visits ${(Number(d.top10RewardShare) * 100).toFixed(2)}%, break-even lift ${d.requiredLiftPct}%.`;
  if (name === "design_program")
    text += " Open /m/onboarding/program to review and activate.";
  if (name === "cohort_metrics")
    text =
      JSON.stringify(data) +
      " Recent cohorts have incomplete follow-up. " +
      String(d.caption ?? "");
  return (
    text +
    (Number(d.demoShare) > 0 || d.includesDemoHistory
      ? " (includes demo history)"
      : "")
  );
}
export function analystTools(api: AgStudioApi) {
  const execute =
    (name: string) =>
    async (args: Record<string, unknown>, ctx: AgAiToolContext) => {
      const r = await fetch("/api/analyst/" + name, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
        signal: ctx.signal,
      });
      if (!r.ok) return ctx.error(`Data unavailable (${r.status}).`);
      const data = await r.json();
      return ctx.success(summarizeTool(name, data), data);
    };
  return [
    api.defineAiTool({
      name: "cohort_metrics",
      description:
        "Read twelve monthly first-visit cohorts, second-visit rates and the honest measurement limit; not causal lift.",
      params: (s) => s.object({}),
      execute: execute("cohort_metrics"),
    }),
    api.defineAiTool({
      name: "program_metrics",
      description: "Read actual payment/reward metrics for the last 1–90 days.",
      params: (s) => s.object({ days: s.number() }),
      execute: execute("program_metrics"),
    }),
    api.defineAiTool({
      name: "flag_abuse",
      description:
        "Read deterministic risk flags in the last 1–90 days; cannot approve anything.",
      params: (s) => s.object({ days: s.number() }),
      execute: execute("flag_abuse"),
    }),
    api.defineAiTool({
      name: "explain_customer",
      description:
        "Read one regular's progress by four-character code. A collision needs disambiguation.",
      params: (s) =>
        s.object({
          code: s.string(),
          lastSeen: s
            .string({
              description:
                "For a code collision, use the exact lastSeen ISO date from the candidate list after asking which regular is intended.",
            })
            .optional(),
        }),
      execute: execute("explain_customer"),
    }),
    api.defineAiTool({
      name: "simulate_rules",
      description:
        "Backtest the full supplied rule. Include spec; visits/spend have different thresholds. No activation.",
      params: (s) =>
        s.object({
          spec: s.object({
            type: s.enum(["VISIT_MILESTONE", "SPEND_MILESTONE"]),
            n: s.number().optional(),
            endowedProgress: s.number().optional(),
            winBack: s
              .object({
                gapDays: s.number(),
                rewardCents: s.number(),
                minVisits: s.number(),
              })
              .optional(),
            spendCents: s.number().optional(),
            rewardCents: s.number(),
            windowDays: s.number(),
            minTicketCents: s.number(),
            mergeWindowMin: s.number(),
            perCustomerMonthlyCapCents: s.number(),
            dailyBudgetCents: s.number(),
            monthlyBudgetCents: s.number(),
            settlement: s.enum(["INSTANT", "DELAYED", "REVIEW"]),
            noteTemplate: s.string(),
          }),
        }),
      execute: async (args, ctx) =>
        execute("simulate_rules")(
          { spec: { ...defaultProgram, ...args.spec } },
          ctx,
        ),
    }),
    api.defineAiTool({
      name: "design_program",
      description:
        "Generate three proposals (15–25 seconds, uses quota). Get explicit confirmation first. Does not activate.",
      params: (s) =>
        s.object({
          goal: s.string(),
          budgetCents: s.number(),
          marginPct: s.number(),
          liftAssumptionPct: s.number(),
        }),
      execute: execute("design_program"),
    }),
  ];
}
