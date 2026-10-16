import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getDb } from "@/db";
import { digests } from "@/db/schema";
import { digestWeek, digestFacts, weeklyDigests } from "@/lib/digests";
import { fixture, setupDb, resetDb, teardownDb } from "./helpers/db";
describe("Weekly digest calendar and facts", () => {
  it("does not recount a long-standing regular after bounded history is loaded", () => {
    const from = new Date("2026-10-12"),
      now = new Date("2026-10-18");
    const history = [
      {
        customerKey: "old",
        startedAt: new Date("2026-10-13"),
        source: "PAY_PAGE",
      },
      {
        customerKey: "old",
        startedAt: new Date("2026-10-15"),
        source: "PAY_PAGE",
      },
    ];
    expect(
      digestFacts(history, [], from, now, "UTC", new Map([["old", 2]]))
        .newRegulars,
    ).toBe(0);
  });
  it("waits until Sunday18:00 in the merchant zone", () => {
    expect(
      digestWeek(new Date("2026-10-18T21:59Z"), "America/New_York").due,
    ).toBe(false);
    expect(
      digestWeek(new Date("2026-10-18T22:00Z"), "America/New_York"),
    ).toEqual({ weekStart: "2026-10-12", due: true });
    expect(
      digestWeek(new Date("2026-10-19T01:00Z"), "America/Los_Angeles").due,
    ).toBe(true);
  });
  it("does not send a Sunday digest on Monday", () =>
    expect(digestWeek(new Date("2026-10-19T12:00Z"), "UTC").due).toBe(false));
  it("counts crossing a second visit, lapsing regulars and net refunds", () => {
    const now = new Date("2026-10-18T23:00Z"),
      from = new Date("2026-10-12T00:00Z"),
      v = (customerKey: string, date: string) => ({
        customerKey,
        startedAt: new Date(date),
        source: "PAY_PAGE",
      });
    const facts = digestFacts(
      [
        v("a", "2026-10-01"),
        v("a", "2026-10-15"),
        v("b", "2026-08-01"),
        v("b", "2026-08-02"),
        v("b", "2026-08-03"),
      ],
      [
        {
          state: "CONFIRMED",
          amountCents: 200,
          offsetAppliedCents: 50,
          sentAt: now,
          createdAt: now,
        },
      ],
      from,
      now,
      "UTC",
    );
    expect(facts).toMatchObject({
      newRegulars: 1,
      lapsingRegulars: 1,
      rewardsPaid: 1,
      costCents: 150,
      busiestDay: "2026-10-15",
    });
  });
});
describe("Weekly digest job", () => {
  beforeAll(setupDb);
  beforeEach(resetDb);
  afterAll(teardownDb);
  it("is idempotent without any AI dependency", async () => {
    await fixture();
    const now = new Date("2026-10-18T23:00Z");
    expect(await weeklyDigests(Date.now() + 10000, now)).toBe(1);
    expect(await weeklyDigests(Date.now() + 10000, now)).toBe(0);
    expect(await getDb().select().from(digests)).toHaveLength(1);
  });
});
