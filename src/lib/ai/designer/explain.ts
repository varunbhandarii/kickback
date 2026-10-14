import { z } from "zod";
import type { Candidate } from "../designer";
import type { Metrics } from "../../engine/simulate";
import { dataBlock, structured, type StructuredCaller } from "../client";
export const Explanations = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: z.enum(["A", "B", "C"]),
        pitch: z.string().max(140),
        rationale: z.string().max(500),
        tradeoff: z.string().max(260),
      }),
    )
    .length(3),
});
export type Explanation = z.infer<typeof Explanations>["items"][number];
export function numberTokens(text: string) {
  return text.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
}
const normalize = (text: string) => {
  const numeric = Number(text.replace(/[$,%]/g, ""));
  return (
    (text.startsWith("$") ? "$" : "") +
    (text.endsWith("%") ? "%" : "") +
    numeric
  );
};
export function allowedNumbers(params: Candidate, metrics: Metrics) {
  const tokens = new Set<string>();
  const add = (value: string | number) => tokens.add(normalize(String(value)));
  for (const [key, value] of Object.entries({ ...params, ...metrics })) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    add(value);
    add(value.toFixed(1));
    add(value.toFixed(2));
    add(Math.round(value));
    if (
      key.endsWith("_cents") ||
      key.endsWith("Cents") ||
      key === "breakEvenRevenuePerReward"
    ) {
      add("$" + (value / 100).toFixed(2));
      add("$" + Number((value / 100).toFixed(2)));
    }
    if (
      [
        "shareReaching",
        "refundCountRatio",
        "gmvRatio",
        "top10RewardShare",
        "demoShare",
      ].includes(key)
    )
      add((value * 100).toFixed(1) + "%");
    if (key === "requiredLiftPct") add(value.toFixed(1) + "%");
  }
  return tokens;
}
export function faithful(text: string, params: Candidate, metrics: Metrics) {
  const allowed = allowedNumbers(params, metrics);
  return (
    numberTokens(text).every((n) => allowed.has(normalize(n))) &&
    !/guarantee|will (increase|grow|boost)|net price|effectively\s*\$/i.test(
      text,
    )
  );
}
export function templateExplanation(
  params: Candidate,
  metrics: Metrics,
): Explanation {
  return {
    id: params.id,
    pitch: "A measured thank-you for returning customers.",
    rationale: `The retrospective simulation costs $${(metrics.monthlyCostCents / 100).toFixed(2)} per month and reaches ${metrics.earners} of ${metrics.customers} customers. It favors ${params.who_it_favors} buyers.`,
    tradeoff:
      "Past behavior does not establish future lift. Review every warning before activation.",
  };
}
export async function explain(
  merchantId: string,
  items: { params: Candidate; metrics: Metrics; warnings: string[] }[],
  caller: StructuredCaller = structured,
  signal?: AbortSignal,
) {
  const calls = [];
  let violations = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await caller({
      merchantId,
      feature: "designer.explain",
      system:
        "Explain supplied simulation results, never estimate outcomes. Return A/B/C once each. Pitch at most 140 characters; rationale at most 60 words; tradeoff at most 30 words. Mention the supplied audience and amber warnings. Use only numbers from that candidate's exact allowedNumbers list, with the same units. Do not claim lift, guaranteed savings, fraud or a net price.",
      user: dataBlock({
        items: items.map((i) => ({
          ...i,
          allowedNumbers: [...allowedNumbers(i.params, i.metrics)],
        })),
        violations,
      }),
      schema: Explanations,
      effort: "medium",
      signal,
    });
    calls.push(response);
    if (
      new Set(response.value.items.map((i) => i.id)).size === 3 &&
      response.value.items.every((item) => {
        const candidate = items.find((i) => i.params.id === item.id);
        return (
          candidate &&
          item.rationale.trim().split(/\s+/).length <= 60 &&
          item.tradeoff.trim().split(/\s+/).length <= 30 &&
          faithful(
            [item.pitch, item.rationale, item.tradeoff].join(" "),
            candidate.params,
            candidate.metrics,
          )
        );
      })
    )
      return { items: response.value.items, calls, fallback: false };
    violations =
      "The last explanation contained unsupported numbers or exceeded length limits. Use only allowedNumbers and supplied warnings.";
  }
  return {
    items: items.map((i) => templateExplanation(i.params, i.metrics)),
    calls,
    fallback: true,
  };
}
