import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  aiCalls,
  designRuns,
  notices,
  programs,
  settings,
  suggestions,
  visits,
} from "@/db/schema";
import { defaultProgram } from "@/lib/engine/program";
import { weeklySuggestions } from "@/lib/ai/weekly";
import { refreshNotices } from "@/lib/guard/notices";
import { purgeOperationalMetadata } from "@/lib/db/purge-tenants";
import {
  fixture,
  milestone,
  purchase,
  resetDb,
  setupDb,
  teardownDb,
} from "./helpers/db";
const mocks = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  design: vi.fn(),
}));
vi.mock("@/lib/ai/client", () => ({ aiEnabled: mocks.enabled }));
vi.mock("@/lib/ai/service", () => ({ createDesign: mocks.design }));
describe("scheduled intelligence", () => {
  beforeAll(setupDb);
  beforeEach(async () => {
    await resetDb();
    mocks.enabled.mockReturnValue(true);
    mocks.design.mockReset();
  });
  afterAll(teardownDb);
  async function ready() {
    const merchant = await fixture();
    for (let i = 0; i < 20; i++)
      await purchase(merchant, { account: "BUYER" + i });
    const [draft] = await getDb()
      .insert(designRuns)
      .values({
        merchantId: merchant.id,
        result: { kind: "designer" },
        expiresAt: new Date(Date.now() + 8 * 86400000),
      })
      .returning();
    mocks.design.mockResolvedValue({
      id: draft.id,
      fallback: false,
      cards: [
        {
          acceptable: true,
          params: {
            id: "A",
            type: "VISIT_MILESTONE",
            n: 12,
            reward_cents: 100,
          },
        },
      ],
    });
    return merchant;
  }
  it("stores one pending suggestion without changing the active program", async () => {
    await ready();
    expect(await weeklySuggestions()).toBe(1);
    expect(await weeklySuggestions()).toBe(0);
    expect(mocks.design).toHaveBeenCalledTimes(1);
    expect(await getDb().select().from(suggestions)).toHaveLength(1);
    expect((await getDb().select().from(programs))[0].spec).toEqual(
      defaultProgram,
    );
  });
  it("does not run for fixtures, disabled AI, or a retained lease", async () => {
    const merchant = await ready();
    await getDb().update(visits).set({ source: "FIXTURE" });
    expect(await weeklySuggestions()).toBe(0);
    await getDb().update(visits).set({ source: "PAY_PAGE" });
    mocks.enabled.mockReturnValue(false);
    expect(await weeklySuggestions()).toBe(0);
    mocks.enabled.mockReturnValue(true);
    await getDb()
      .insert(settings)
      .values({
        key: "ai-weekly:" + merchant.id,
        value: { until: new Date(Date.now() + 90000).toISOString() },
      });
    expect(await weeklySuggestions()).toBe(0);
    expect(mocks.design).not.toHaveBeenCalled();
  });
  it("backs off after an AI failure without affecting payment eligibility", async () => {
    await ready();
    mocks.design.mockRejectedValue(new Error("TIMEOUT"));
    expect(await weeklySuggestions()).toBe(0);
    expect(await weeklySuggestions()).toBe(0);
    expect(mocks.design).toHaveBeenCalledTimes(1);
    expect(await getDb().select().from(suggestions)).toHaveLength(0);
    expect((await getDb().select().from(programs))[0].status).toBe("ACTIVE");
  });
  it("deduplicates active notices and closes a warning after the ratio recovers", async () => {
    const merchant = await fixture(),
      { reward } = await milestone(merchant);
    const { rewards } = await import("@/db/schema");
    await getDb()
      .update(rewards)
      .set({ state: "SENT", sentAt: new Date() })
      .where(eq(rewards.id, reward.id));
    await refreshNotices();
    await refreshNotices();
    const active = () =>
      getDb()
        .select()
        .from(notices)
        .where(
          and(eq(notices.merchantId, merchant.id), isNull(notices.readAt)),
        );
    expect((await active()).map((n) => n.kind).sort()).toEqual([
      "GMV_RATIO",
      "REFUND_RATIO",
    ]);
    for (let i = 0; i < 30; i++)
      await purchase(merchant, { account: "OTHER" + i });
    await refreshNotices();
    expect(await active()).toHaveLength(0);
    expect(await getDb().select().from(notices)).toHaveLength(2);
  });
  it("expires draft references safely while retaining current usage and unread notices", async () => {
    const merchant = await ready(),
      [draft] = await getDb().select().from(designRuns);
    await getDb()
      .insert(suggestions)
      .values({
        merchantId: merchant.id,
        designRunId: draft.id,
        candidateId: "A",
      });
    await getDb()
      .update(designRuns)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(designRuns.id, draft.id));
    const old = new Date(Date.now() - 91 * 86400000);
    await getDb()
      .insert(aiCalls)
      .values([
        {
          merchantId: merchant.id,
          feature: "test",
          model: "test",
          createdAt: old,
        },
        { merchantId: merchant.id, feature: "test", model: "test" },
      ]);
    await getDb()
      .insert(notices)
      .values([
        {
          merchantId: merchant.id,
          kind: "OLD_READ",
          severity: "info",
          body: "Read",
          createdAt: old,
          readAt: old,
        },
        {
          merchantId: merchant.id,
          kind: "OLD_UNREAD",
          severity: "info",
          body: "Unread",
          createdAt: old,
        },
      ]);
    await purgeOperationalMetadata();
    expect((await getDb().select().from(suggestions))[0]).toMatchObject({
      status: "EXPIRED",
      designRunId: null,
    });
    expect(await getDb().select().from(designRuns)).toHaveLength(0);
    expect(await getDb().select().from(aiCalls)).toHaveLength(1);
    expect((await getDb().select().from(notices)).map((n) => n.kind)).toEqual([
      "OLD_UNREAD",
    ]);
  });
});
