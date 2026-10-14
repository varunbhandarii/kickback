import { z } from "zod";
import {
  fallbackCandidates,
  candidateSpec,
  validateCandidates,
  CandidateValidationError,
  type Candidate,
} from "../designer";
import {
  aiEnabled,
  structured,
  type StructuredCaller,
  type Usage,
} from "../client";
import { propose } from "./propose";
import { explain, templateExplanation, type Explanation } from "./explain";
import {
  metricWarnings,
  metricsAcceptable,
  simulate,
  type Metrics,
} from "../../engine/simulate";
import type { VisitView } from "../../engine/evaluate";
import type { DesignContext } from "./context";
export const designInputSchema = z.strictObject({
  goal: z.string().trim().min(1).max(300),
  budgetCents: z.number().int().min(100).max(10000000),
  marginPct: z.number().min(1).max(100),
  liftAssumptionPct: z.number().min(3).max(10),
});
export type DesignedCard = {
  params: Candidate;
  metrics: Metrics;
  warnings: string[];
  explanation: Explanation;
  acceptable: boolean;
};
export type DesignResult = {
  input: z.infer<typeof designInputSchema>;
  category: string;
  ticketP50: number;
  windowStart: string;
  windowEnd: string;
  cards: DesignedCard[];
  model: string;
  promptVersion: string;
  aiCallIds: string[];
  usage: Usage;
  fallback: boolean;
  fallbackReason?: string;
  includesDemoHistory: boolean;
  demoShare: number;
};
export async function designPipeline(
  merchantId: string,
  context: DesignContext,
  history: VisitView[],
  options: {
    caller?: StructuredCaller;
    enabled?: boolean;
    signal?: AbortSignal;
    tz?: string;
  } = {},
): Promise<DesignResult> {
  const input = designInputSchema.parse({
    goal: context.goal,
    budgetCents: context.budgetCents,
    marginPct: context.marginPct,
    liftAssumptionPct: context.liftAssumptionPct,
  });
  const actualCaller = options.caller ?? structured,
    calls: { callId: string; model: string; usage: Usage }[] = [];
  const caller: StructuredCaller = async (opts) => {
    const response = await actualCaller(opts);
    calls.push(response);
    return response;
  };
  const make = (params: Candidate) => {
    const metrics = simulate(
      candidateSpec(params),
      history,
      options.tz ?? "America/New_York",
      {
        windowStart: new Date(context.windowStart),
        windowEnd: new Date(context.windowEnd),
        marginPct: input.marginPct,
      },
    );
    return {
      params,
      metrics,
      warnings: metricWarnings(metrics, context.category),
      acceptable: metricsAcceptable(metrics),
      explanation: templateExplanation(params, metrics),
    };
  };
  let cards: DesignedCard[] | undefined,
    fallback = false,
    fallbackReason: string | undefined;
  if (options.enabled ?? aiEnabled()) {
    let violations = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await propose(
          merchantId,
          context,
          caller,
          violations,
          options.signal,
        );
        const proposed = validateCandidates(
          { candidates: response.candidates },
          context,
        ).candidates.map(make);
        if (proposed.some((c) => !c.acceptable)) {
          violations =
            "Simulation rejected these candidates: " +
            JSON.stringify(
              proposed
                .filter((c) => !c.acceptable)
                .map((c) => ({
                  parameters: c.params,
                  gmvRatio: c.metrics.gmvRatio,
                  refundCountRatio: c.metrics.refundCountRatio,
                })),
            ) +
            ". Maximum gmvRatio is 0.05 and refundCountRatio is 0.15. Increase the target to reduce refund count; lowering only the reward does not reduce refund frequency. Lower the reward or increase the target to reduce revenue cost. Regenerate all three, preserving valid candidates where possible.";
          continue;
        }
        cards = proposed;
        break;
      } catch (error) {
        violations =
          error instanceof CandidateValidationError
            ? error.message
            : error instanceof z.ZodError
              ? error.issues
                  .map((i) => i.path.join(".") + ": " + i.code)
                  .join("; ")
              : "The proposal failed structured parsing or was unavailable. Re-read all ceilings.";
      }
    }
  }
  if (!cards) {
    fallback = true;
    fallbackReason =
      "AI unavailable or proposals failed validation; deterministic templates used.";
    cards = fallbackCandidates(context).map(make);
  }
  if (!fallback) {
    try {
      const response = await explain(merchantId, cards, caller, options.signal);
      fallback = response.fallback;
      for (const card of cards)
        card.explanation = response.items.find((i) => i.id === card.params.id)!;
    } catch {
      fallback = true;
      fallbackReason = "Explanation unavailable; validated templates used.";
    }
  }
  const usage = calls.reduce(
    (u, c) => ({
      inputTokens: u.inputTokens + c.usage.inputTokens,
      outputTokens: u.outputTokens + c.usage.outputTokens,
      cacheReadTokens: u.cacheReadTokens + c.usage.cacheReadTokens,
      cacheWriteTokens: u.cacheWriteTokens + c.usage.cacheWriteTokens,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  );
  return {
    input,
    category: context.category,
    ticketP50: context.ticketP50,
    windowStart: context.windowStart,
    windowEnd: context.windowEnd,
    cards,
    model: calls.at(-1)?.model ?? "deterministic",
    promptVersion: "designer-2",
    aiCallIds: calls.map((c) => c.callId),
    usage,
    fallback,
    fallbackReason,
    includesDemoHistory: context.includesDemoHistory,
    demoShare: context.demoShare,
  };
}
