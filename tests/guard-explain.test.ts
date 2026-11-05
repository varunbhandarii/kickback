import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { guardFlags, rewards } from "@/db/schema";
import { fixture, purchase, resetDb, setupDb, teardownDb } from "./helpers/db";
const m = vi.hoisted(() => ({ structured: vi.fn() }));
vi.mock("@/lib/ai/client", async (original) => ({
  ...(await original<typeof import("@/lib/ai/client")>()),
  aiEnabled: () => true,
  structured: m.structured,
}));
import { explainFlag } from "@/lib/guard/explain";

const DAY = 86400000;
/** A customer at 4 of 5 pays $1, $1 and $60 within minutes: Guard holds the reward (score 70). */
async function heldReward() {
  const merchant = await fixture(),
    now = Date.now();
  for (const d of [20, 15, 10, 5]) await purchase(merchant, { at: new Date(now - d * DAY), account: "SPLIT" });
  for (const [i, amount] of [100, 100, 6000].entries())
    await purchase(merchant, { at: new Date(now - (10 - i * 3) * 60000), amount, account: "SPLIT" });
  const [reward] = await getDb().select().from(rewards);
  expect(reward.state).toBe("HELD");
  return { merchant, reward };
}
const reply = (explanation: string, extra: object = {}, callId = "call-" + Math.random()) => ({
  value: { explanation, ...extra },
  callId,
});
const stored = async (rewardId: string) =>
  (await getDb().select().from(guardFlags).where(eq(guardFlags.rewardId, rewardId)))[0].explanation as {
    explanation: string;
    aiCallIds: string[];
    suggested_rule_change?: unknown;
  };

describe("Guard explanations", () => {
  beforeAll(setupDb);
  afterAll(teardownDb);
  beforeEach(async () => {
    await resetDb();
    m.structured.mockReset();
  });
  it("accepts dollar amounts from the data and stores the checked explanation", async () => {
    const { merchant, reward } = await heldReward();
    m.structured.mockResolvedValueOnce(
      reply("Three payments were merged into one $62.00 visit, far above the usual $5.50, so this $2.00 reward waits for you.", {}, "call-1"),
    );
    await explainFlag(merchant.id, reward.id);
    expect(await stored(reward.id)).toMatchObject({ aiCallIds: ["call-1"], explanation: expect.stringContaining("$62.00") });
    expect(m.structured.mock.calls[0][0].user).toContain('"ticket":"$62.00"');
  });
  it("regenerates once when a draft invents a number", async () => {
    const { merchant, reward } = await heldReward();
    m.structured
      .mockResolvedValueOnce(reply("About 47 similar visits look like this.", {}, "call-1"))
      .mockResolvedValueOnce(reply("Three payments merged into a $62.00 visit.", {}, "call-2"));
    await explainFlag(merchant.id, reward.id);
    expect(m.structured).toHaveBeenCalledTimes(2);
    expect(await stored(reward.id)).toMatchObject({ aiCallIds: ["call-1", "call-2"], explanation: "Three payments merged into a $62.00 visit." });
  });
  it("stores Guard's own reasons when both drafts fail the checks", async () => {
    const { merchant, reward } = await heldReward();
    m.structured.mockResolvedValue(reply("This is 11.3 times the usual ticket."));
    await explainFlag(merchant.id, reward.id);
    const saved = await stored(reward.id);
    expect(saved.aiCallIds).toEqual([]);
    expect(saved.explanation).toMatch(/Three or more payments merged/);
  });
  it("drops an out-of-range rule suggestion but keeps the explanation", async () => {
    const { merchant, reward } = await heldReward();
    m.structured.mockResolvedValueOnce(
      reply("Three payments merged into one visit.", {
        suggested_rule_change: { field: "mergeWindowMin", from: 999, to: 30, why: "Shorter merges." },
      }),
    );
    await explainFlag(merchant.id, reward.id);
    const saved = await stored(reward.id);
    expect(saved.explanation).toBe("Three payments merged into one visit.");
    expect(saved.suggested_rule_change).toBeUndefined();
  });
});
