import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { captures, customers, rewards, visits } from "@/db/schema";
import { seedHistory, syntheticVisits } from "@/lib/demo/history";
import { enqueue } from "@/lib/rewards/enqueue";
import { fixture, purchase, resetDb, setupDb, teardownDb } from "./helpers/db";
describe("synthetic history isolation", () => {
  beforeAll(setupDb);
  beforeEach(resetDb);
  afterAll(teardownDb);
  it("generates repeatable category distributions", () => {
    const opts = {
      category: "cafe",
      customers: 100,
      days: 90,
      seed: "fixed",
      now: new Date("2026-10-14T20:00:00Z"),
    };
    const rows = syntheticVisits(opts);
    expect(rows).toEqual(syntheticVisits(opts));
    expect(rows.length).toBeGreaterThan(300);
    expect(rows.every((r) => r.at <= opts.now && r.amountCents >= 100)).toBe(
      true,
    );
  });
  it("seeds excluded customers and nonrefundable captures; clear preserves real purchases", async () => {
    const merchant = await fixture();
    await purchase(merchant);
    const seed = await seedHistory("rosas", "cafe", 20, 90, false, "fixed");
    expect(seed.visits).toBeGreaterThan(0);
    const people = await getDb()
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, merchant.id),
          eq(customers.status, "EXCLUDED"),
        ),
      );
    for (const person of people)
      await getDb().transaction((tx) => enqueue(tx, merchant, person.key));
    expect(await getDb().select().from(rewards)).toHaveLength(0);
    const fixtureCaptures = (await getDb().select().from(captures)).filter(
      (c) => c.id.startsWith("fx:"),
    );
    expect(
      fixtureCaptures.every(
        (c) => c.refundableCents === 0 && c.status === "FIXTURE",
      ),
    ).toBe(true);
    await seedHistory("rosas", "cafe", 20, 90, true);
    expect(await getDb().select().from(captures)).toHaveLength(1);
    expect(await getDb().select().from(visits)).toHaveLength(1);
    expect(await getDb().select().from(customers)).toHaveLength(1);
  });
});
