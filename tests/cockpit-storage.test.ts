import { randomUUID } from "node:crypto";
import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";
const actor = vi.hoisted(() => ({ current: vi.fn() }));
vi.mock("@/lib/dal", () => ({ requireMerchant: actor.current }));
import { getDb } from "@/db";
import {
  cockpitStates,
  cockpitThreads,
  aiTurnCache,
  auditLog,
  user,
  merchants,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { saveCockpitState, resetCockpitState } from "@/app/m/cockpit/actions";
import { purgeOperationalMetadata, purgeTenants } from "@/lib/db/purge-tenants";
import { defaultState } from "@/lib/studio/default-state";
import { defaultProgram } from "@/lib/engine/program";
import { setupDb, resetDb, teardownDb, fixture } from "./helpers/db";
const state = () =>
  defaultState({
    name: "Cafe",
    rule: "5 visits",
    spec: defaultProgram,
    tz: "UTC",
    demo: false,
    model: "test",
    asOfDay: "2026-10-15",
  });
describe("Cockpit storage lifecycle", () => {
  beforeAll(setupDb);
  beforeEach(async () => {
    await resetDb();
    const merchant = await fixture(),
      id = randomUUID();
    await getDb()
      .insert(user)
      .values({ id, name: "Owner", email: id + "@example.com" });
    actor.current.mockResolvedValue({ merchant, user: { id } });
  });
  afterAll(teardownDb);
  it("upserts a layout once and audits without its body", async () => {
    await saveCockpitState(state());
    await saveCockpitState(state());
    expect(await getDb().select().from(cockpitStates)).toHaveLength(1);
    const audits = await getDb().select().from(auditLog);
    expect(
      audits.filter((a) => a.action === "cockpit.state_saved"),
    ).toHaveLength(2);
    expect(
      audits.every((a) => !JSON.stringify(a.details).includes("widgets")),
    ).toBe(true);
  });
  it("resets only the owner's selected business", async () => {
    await saveCockpitState(state());
    const other = await fixture(undefined, "salon");
    await getDb()
      .insert(cockpitStates)
      .values({ merchantId: other.id, state: state(), studioVersion: "3.0.0" });
    await resetCockpitState();
    const rows = await getDb().select().from(cockpitStates);
    expect(rows).toHaveLength(1);
    expect(rows[0].merchantId).toBe(other.id);
  });
  it("does not save if owner resolution denies access", async () => {
    actor.current.mockRejectedValue(new Error("Denied"));
    await expect(saveCockpitState(state())).rejects.toThrow("Denied");
    expect(await getDb().select().from(cockpitStates)).toHaveLength(0);
  });
  it("purges expired threads/cache and preserves current rows", async () => {
    const { merchant } = await actor.current(),
      now = new Date();
    await getDb()
      .insert(cockpitThreads)
      .values([
        {
          merchantId: merchant.id,
          threadId: "old",
          summary: {},
          messages: [],
          updatedAt: new Date(+now - 31 * 86400000),
        },
        { merchantId: merchant.id, threadId: "new", summary: {}, messages: [] },
      ]);
    await getDb()
      .insert(aiTurnCache)
      .values([
        {
          merchantId: merchant.id,
          toolUseId: "old",
          content: [],
          createdAt: new Date(+now - 86400001),
        },
        { merchantId: merchant.id, toolUseId: "new", content: [] },
      ]);
    await purgeOperationalMetadata(now);
    expect(
      (await getDb().select().from(cockpitThreads)).map((t) => t.threadId),
    ).toEqual(["new"]);
    expect(
      (await getDb().select().from(aiTurnCache)).map((t) => t.toolUseId),
    ).toEqual(["new"]);
  });
  it("removes layouts, threads and cache when a tenant is purged", async () => {
    const { merchant } = await actor.current();
    await saveCockpitState(state());
    await getDb()
      .insert(cockpitThreads)
      .values({
        merchantId: merchant.id,
        threadId: "thread",
        summary: {},
        messages: [],
      });
    await getDb()
      .insert(aiTurnCache)
      .values({ merchantId: merchant.id, toolUseId: "call", content: [] });
    await getDb()
      .update(merchants)
      .set({ purgeAfter: new Date(0) })
      .where(eq(merchants.id, merchant.id));
    expect(await purgeTenants()).toBe(1);
    expect(await getDb().select().from(cockpitStates)).toHaveLength(0);
    expect(await getDb().select().from(cockpitThreads)).toHaveLength(0);
    expect(await getDb().select().from(aiTurnCache)).toHaveLength(0);
  });
});
