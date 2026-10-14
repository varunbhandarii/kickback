import { describe, it, expect, vi, afterEach } from "vitest";
import { buildContext } from "@/lib/ai/designer/context";
import {
  fallbackCandidates,
  validateCandidates,
  candidateSpec,
} from "@/lib/ai/designer";
import { simulate } from "@/lib/engine/simulate";
import { evaluate, type VisitView } from "@/lib/engine/evaluate";
import { defaultProgram } from "@/lib/engine/program";
import { faithful, templateExplanation } from "@/lib/ai/designer/explain";
import { designPipeline } from "@/lib/ai/designer/pipeline";
import type { StructuredCaller } from "@/lib/ai/client";
const now = new Date("2026-10-14T16:00:00Z");
const history = (n: number, source = "PAY_PAGE"): VisitView[] =>
  Array.from({ length: n }, (_, i) => ({
    id: "v" + i,
    customerKey: "PRIVATE_KEY",
    startedAt: new Date(+now - (n - i) * 86400000),
    amountCents: 600,
    status: "COMPLETED",
    source,
  }));
const input = {
  goal: "Thank weekday regulars",
  budgetCents: 15000,
  marginPct: 60,
  liftAssumptionPct: 5,
};
afterEach(() => vi.unstubAllEnvs());
describe("Designer calculations and boundaries", () => {
  it("exports aggregates without identifiers or raw history", () => {
    const ctx = buildContext("cafe", history(12, "FIXTURE"), input, now);
    expect(JSON.stringify(ctx)).not.toContain("PRIVATE_KEY");
    expect(ctx.visitsPerCustomer).toEqual([0, 0, 0, 0, 0, 1]);
    expect(ctx.demoShare).toBe(1);
    expect(ctx.ticketP50).toBe(600);
  });
  it.each(["cafe", "bakery", "salon", "other"])(
    "keeps fallback ceilings for %s",
    (category) => {
      const ctx = buildContext(category, history(30), input, now);
      expect(
        validateCandidates({ candidates: fallbackCandidates(ctx) }, ctx)
          .candidates,
      ).toHaveLength(3);
    },
  );
  it("rejects budget, reward percentage, ranges, unknown fields and duplicate audiences", () => {
    const ctx = buildContext("cafe", history(12), input, now),
      valid = fallbackCandidates(ctx);
    for (const edit of [
      { monthly_budget_cents: 16000 },
      { reward_cents: 2501 },
      { window_days: 13 },
      { min_ticket_cents: 601 },
      { n: 2, reward_cents: 200 },
      { daily_budget_cents: 16000 },
      { per_customer_monthly_cap_cents: 10 },
      { rationale: "invented" },
    ])
      expect(() =>
        validateCandidates(
          { candidates: [{ ...valid[0], ...edit }, ...valid.slice(1)] },
          ctx,
        ),
      ).toThrow();
  });
  it("calculates exact cost, first reward timing, concentration and break-even", () => {
    const rows = history(10),
      m = simulate({ ...defaultProgram }, rows, "America/New_York", {
        windowEnd: now,
        marginPct: 50,
      });
    expect(m.costCents90).toBe(400);
    expect(m.monthlyCostCents).toBe(133);
    expect(m.medianDaysToFirstReward).toBe(4);
    expect(m.shareReaching).toBe(1);
    expect(m.gmvRatio).toBeCloseTo(400 / 6000);
    expect(m.requiredLiftPct).toBeCloseTo((100 * 400) / 6000 / 0.5);
    expect(m.breakEvenRevenuePerReward).toBe(400);
    expect(m.top10RewardShare).toBe(1);
  });
  it("consumes blocked milestones and treats history deterministically", () => {
    const spec = { ...defaultProgram, monthlyBudgetCents: 200 },
      rows = history(15);
    const a = simulate(spec, rows, "America/New_York", { windowEnd: now }),
      b = simulate(spec, rows.toReversed(), "America/New_York", {
        windowEnd: now,
      });
    expect(a).toEqual(b);
    expect(a.rewards).toBe(1);
    expect(a.budgetBlocked).toBe(2);
  });
  it("includes fixtures only in simulation, never live eligibility", () => {
    const rows = history(5, "FIXTURE");
    expect(
      evaluate(
        { ...defaultProgram },
        rows,
        [],
        { dailyUsedCents: 0, monthlyUsedCents: 0, customerMonthlyUsedCents: 0 },
        now,
        "America/New_York",
      ).intents,
    ).toHaveLength(0);
    expect(
      simulate({ ...defaultProgram }, rows, "America/New_York", {
        windowEnd: now,
      }).demoShare,
    ).toBe(1);
  });
  it("checks exact units and rejects invented numbers and lift claims", () => {
    const p = fallbackCandidates(
        buildContext("cafe", history(12), input, now),
      )[0],
      m = simulate(candidateSpec(p), history(12), "America/New_York", {
        windowEnd: now,
      }),
      t = templateExplanation(p, m);
    expect(faithful(t.rationale, p, m)).toBe(true);
    expect(faithful("$123.45 future profit", p, m)).toBe(false);
    expect(faithful("99.9% lift", p, m)).toBe(false);
    expect(faithful("This will increase sales", p, m)).toBe(false);
  });
  it("falls back without a key and after refusal/timeout/parse errors", async () => {
    const ctx = buildContext("cafe", history(12), input, now);
    const caller: StructuredCaller = async () => {
      throw new Error("refusal");
    };
    for (const enabled of [false, true]) {
      const result = await designPipeline("merchant", ctx, history(12), {
        enabled,
        caller,
      });
      expect(result.cards).toHaveLength(3);
      expect(result.fallback).toBe(true);
    }
  });
  it("supports one introductory credit cycle, never a no-purchase reward", () => {
    const spec = { ...defaultProgram, n: 10, endowedProgress: 2 },
      budget = {
        dailyUsedCents: 0,
        monthlyUsedCents: 0,
        customerMonthlyUsedCents: 0,
      };
    expect(
      evaluate(spec, [], [], budget, now, "America/New_York").intents,
    ).toHaveLength(0);
    expect(
      evaluate(spec, history(8), [], budget, now, "America/New_York").intents,
    ).toHaveLength(1);
    expect(
      simulate(spec, history(18), "America/New_York", { windowEnd: now })
        .rewards,
    ).toBe(2);
  });
});
