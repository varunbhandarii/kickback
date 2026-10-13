import { describe, expect, it } from "vitest";
import { evaluate, type VisitView } from "@/lib/engine/evaluate";
import { defaultProgram } from "@/lib/engine/program";
const start = new Date("2026-10-10T00:00:00Z"),
  now = new Date("2026-10-15T00:00:00Z");
const budget = {
  dailyUsedCents: 0,
  monthlyUsedCents: 0,
  customerMonthlyUsedCents: 0,
};
function history(count: number): VisitView[] {
  return Array.from({ length: count }, (_, n) => ({
    id: `visit-${n}`,
    startedAt: new Date(start.getTime() - (count - n) * 86400000),
    amountCents: 550,
    status: "COMPLETED",
  }));
}
describe("program start boundary", () => {
  it("consumes historical five-visit cycles and carries over only the remainder", () => {
    const result = evaluate(
      defaultProgram,
      history(7),
      [],
      budget,
      now,
      "UTC",
      { rewardableFrom: start },
    );
    expect(result.intents).toEqual([]);
    expect(result.consumed).toHaveLength(1);
    expect(result.consumed[0].reason).toBe("BEFORE_PROGRAM_START");
    expect(result.progress.current).toBe(2);
  });
  it("continues three historical visits and earns exactly at the fifth new boundary", () => {
    const past = history(3),
      fourth: VisitView = {
        id: "fourth",
        startedAt: start,
        amountCents: 550,
        status: "COMPLETED",
      },
      fifth = {
        ...fourth,
        id: "fifth",
        startedAt: new Date(start.getTime() + 86400000),
      };
    const four = evaluate(
      defaultProgram,
      [...past, fourth],
      [],
      budget,
      now,
      "UTC",
      { rewardableFrom: start },
    );
    expect(four.intents).toEqual([]);
    expect(four.progress.current).toBe(4);
    const five = evaluate(
      defaultProgram,
      [...past, fourth, fifth],
      [],
      budget,
      now,
      "UTC",
      { rewardableFrom: start },
    );
    expect(five.intents.map((row) => row.visitId)).toEqual(["fifth"]);
  });
  it("does not consume budget for a past spend milestone", () => {
    const spec = {
      ...defaultProgram,
      type: "SPEND_MILESTONE" as const,
      spendCents: 1000,
      dailyBudgetCents: 200,
    };
    const past = history(2),
      fresh: VisitView = {
        id: "fresh",
        startedAt: start,
        amountCents: 1100,
        status: "COMPLETED",
      };
    const result = evaluate(spec, [...past, fresh], [], budget, now, "UTC", {
      rewardableFrom: start,
    });
    expect(result.consumed[0].reason).toBe("BEFORE_PROGRAM_START");
    expect(result.intents).toHaveLength(1);
    expect(result.progress.blocked).toBeUndefined();
  });
});
