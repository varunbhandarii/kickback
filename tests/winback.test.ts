import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getDb } from "@/db";
import { rewards } from "@/db/schema";
import { fixture, purchase, setupDb, resetDb, teardownDb } from "./helpers/db";
import { evaluate, type VisitView } from "@/lib/engine/evaluate";
import {
  defaultProgram,
  loadProgram,
  rewardNote,
  type ProgramSpec,
} from "@/lib/engine/program";
import { simulate } from "@/lib/engine/simulate";
const spec: ProgramSpec = {
  ...defaultProgram,
  n: 20,
  windowDays: 365,
  winBack: { gapDays: 30, rewardCents: 100, minVisits: 3 },
};
const at = (day: number) => new Date(Date.UTC(2026, 0, day, 12));
const visit = (day: number, source = "PAY_PAGE"): VisitView => ({
  id: String(day),
  startedAt: at(day),
  amountCents: 550,
  status: "COMPLETED",
  source,
  customerKey: "regular",
});
describe("Welcome-back outbox", () => {
  beforeAll(setupDb);
  beforeEach(resetDb);
  afterAll(teardownDb);
  it("enqueues one normal guarded refund intent with its own amount and note", async () => {
    const merchant = await fixture(spec);
    for (const day of [1, 2, 3, 33]) await purchase(merchant, { at: at(day) });
    const rows = await getDb().select().from(rewards);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "WIN_BACK",
      amountCents: 100,
      tier: "INSTANT",
      state: "SCHEDULED",
      note: "Welcome back to Rosa's Cafe. A loyalty reward to thank you!",
    });
    await purchase(merchant, { at: at(34) });
    expect(await getDb().select().from(rewards)).toHaveLength(1);
  });
});
const budget = {
  dailyUsedCents: 0,
  monthlyUsedCents: 0,
  customerMonthlyUsedCents: 0,
};
const run = (rows: VisitView[], s = spec) =>
  evaluate(s, rows, [], budget, rows.at(-1)!.startedAt, "UTC", {
    rewardableFrom: at(1),
  });
describe("Welcome-back rewards", () => {
  it("measures inactivity from a completed low-ticket visit", () => {
    const r = run([
      visit(1),
      visit(2),
      visit(3),
      { ...visit(25), amountCents: 100 },
      visit(33),
    ]);
    expect(r.intents).toHaveLength(0);
  });
  it("consumes a milestone reached on an existing welcome-back visit", () => {
    const r = evaluate(
      { ...spec, n: 4 },
      [visit(1), visit(2), visit(3), visit(33), visit(34)],
      [
        {
          visitId: "33",
          state: "HELD",
          kind: "WIN_BACK",
          amountCents: 100,
          createdAt: at(33),
        },
      ],
      budget,
      at(34),
      "UTC",
    );
    expect(r.intents).toHaveLength(0);
    expect(r.progress.current).toBe(1);
  });
  it("fires at the gap boundary", () => {
    expect(
      run([visit(1), visit(2), visit(3), visit(33)]).intents,
    ).toMatchObject([
      { reason: "WIN_BACK", amountCents: 100, basisVisitIds: ["33"] },
    ]);
  });
  it("does not fire a day early", () =>
    expect(run([visit(1), visit(2), visit(3), visit(32)]).intents).toHaveLength(
      0,
    ));
  it("requires three prior qualifying visits", () =>
    expect(run([visit(1), visit(2), visit(33)]).intents).toHaveLength(0));
  it("keeps the regular milestone precedence", () =>
    expect(
      run([visit(1), visit(2), visit(3), visit(33)], { ...spec, n: 4 })
        .intents[0].reason,
    ).toBe("VISIT_MILESTONE"));
  it("limits welcome-back to once per180 days", () =>
    expect(
      run([visit(1), visit(2), visit(3), visit(33), visit(63), visit(93)])
        .intents,
    ).toHaveLength(1));
  it("allows another after180 days", () =>
    expect(
      run([visit(1), visit(2), visit(3), visit(33), visit(213)]).intents,
    ).toHaveLength(2));
  it("respects the program boundary and backfill exclusion", () => {
    expect(
      run([visit(1), visit(2), visit(3), visit(33, "BACKFILL")]).intents,
    ).toHaveLength(0);
    expect(
      evaluate(
        spec,
        [visit(1), visit(2), visit(3), visit(33)],
        [],
        budget,
        at(33),
        "UTC",
        { rewardableFrom: at(34) },
      ).intents,
    ).toHaveLength(0);
  });
  it("applies ordinary caps and keeps the blocked cycle consumed", () => {
    const r = evaluate(
      spec,
      [visit(1), visit(2), visit(3), visit(33)],
      [],
      { ...budget, customerMonthlyUsedCents: 1000 },
      at(33),
      "UTC",
    );
    expect(r.intents).toHaveLength(0);
    expect(r.consumed[0]).toMatchObject({
      kind: "WIN_BACK",
      reason: "MONTHLY_CAP",
    });
  });
  it("preserves regular progress when a welcome-back reward already exists", () => {
    const r = evaluate(
      spec,
      [visit(1), visit(2), visit(3), visit(33), visit(34)],
      [
        {
          visitId: "33",
          state: "CONFIRMED",
          amountCents: 100,
          createdAt: at(33),
          kind: "WIN_BACK",
        },
      ],
      budget,
      at(34),
      "UTC",
    );
    expect(r.intents).toHaveLength(0);
    expect(r.progress.current).toBe(5);
  });
  it("reports welcome-back simulator totals", () => {
    const m = simulate(spec, [visit(1), visit(2), visit(3), visit(33)], "UTC", {
      windowStart: at(1),
      windowEnd: at(90),
    });
    expect(m.winBackRewards).toBe(1);
    expect(m.winBackCostCents).toBe(100);
    expect(m.costCents).toBe(100);
  });
  it("rejects a reward larger than the regular reward", () =>
    expect(() =>
      loadProgram({ ...spec, winBack: { ...spec.winBack, rewardCents: 300 } }),
    ).toThrow());
  it("uses a bounded welcome-back thank-you", () =>
    expect(rewardNote(spec, "Rosa's Cafe", "reward", "WIN_BACK")).toBe(
      "Welcome back to Rosa's Cafe. A loyalty reward to thank you!",
    ));
});
