import { randomUUID } from "node:crypto";
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
vi.mock("@/lib/dal", () => ({ getSession: vi.fn(), ownedMerchant: vi.fn() }));
import { getDb } from "@/db";
import {
  merchantUsers,
  user,
  customers,
  cockpitThreads,
  aiTurnCache,
} from "@/db/schema";
import { analystRequest, resolveCode } from "@/lib/studio/analyst-server";
import {
  saveThread,
  loadThread,
  listThreads,
  deleteThread,
} from "@/lib/studio/threads";
import { saveTurn, cachedTurn } from "@/lib/studio/llm/cache";
import { setupDb, teardownDb, resetDb, fixture, purchase } from "./helpers/db";
describe("Analyst tenant boundaries", () => {
  beforeAll(setupDb);
  beforeEach(resetDb);
  afterAll(teardownDb);
  async function owner(merchantId: string) {
    const id = randomUUID();
    await getDb()
      .insert(user)
      .values({ id, name: "Owner", email: id + "@example.com" });
    await getDb().insert(merchantUsers).values({ userId: id, merchantId });
    return { userId: id, merchantId };
  }
  it("overwrites a foreign tenant ID and ignores a supplied full key", async () => {
    const a = await fixture(),
      b = await fixture(undefined, "salon"),
      actor = await owner(a.id);
    await purchase(a, { id: "A" });
    await purchase(b, { id: "B" });
    const result = (await analystRequest(
      "program_metrics",
      { days: 30, merchantId: b.id },
      actor,
    )) as { payments: number };
    expect(result.payments).toBe(1);
    await expect(
      analystRequest("explain_customer", { customerKey: "foreign" }, actor),
    ).rejects.toThrow("code");
  });
  it("returns code collisions without revealing full keys", async () => {
    const a = await fixture(),
      now = new Date();
    await getDb()
      .insert(customers)
      .values(
        ["ABCDone", "abcdtwo"].map((key) => ({
          merchantId: a.id,
          key,
          firstSeen: now,
          lastSeen: now,
        })),
      );
    const result = await resolveCode(a.id, "ABCD");
    expect("candidates" in result && result.candidates).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("one");
  });
  it("accepts base64url code characters used by the actual identity keys", async () => {
    const a = await fixture(),
      now = new Date();
    await getDb()
      .insert(customers)
      .values({
        merchantId: a.id,
        key: "-R_0suffix",
        firstSeen: now,
        lastSeen: now,
      });
    expect(await resolveCode(a.id, "-R_0")).toEqual({
      customerKey: "-R_0suffix",
    });
  });
  it("cannot load, overwrite or delete another tenant's thread", async () => {
    const a = await fixture(),
      b = await fixture(undefined, "salon"),
      thread = {
        summary: {
          threadId: "thread",
          agentId: "kickback-analyst",
          updatedAt: 1,
        },
        messages: [],
      };
    await saveThread(a.id, "thread", thread);
    expect(await loadThread(b.id, "thread")).toBeUndefined();
    await expect(saveThread(b.id, "thread", thread)).rejects.toThrow();
    await deleteThread(b.id, "thread");
    expect(await listThreads(a.id)).toHaveLength(1);
  });
  it("retains the newest20 threads and round-trips messages", async () => {
    const a = await fixture();
    for (let n = 0; n < 21; n++)
      await saveThread(a.id, "t" + n, {
        summary: {
          threadId: "t" + n,
          agentId: "kickback-analyst",
          updatedAt: n,
        },
        messages: [{ role: "user", text: "Question" }],
      });
    expect(await listThreads(a.id)).toHaveLength(20);
    expect((await loadThread(a.id, "t20"))?.messages).toHaveLength(1);
    expect(await getDb().select().from(cockpitThreads)).toHaveLength(20);
  });
  it("scopes signed turns and expires them after24 hours", async () => {
    const a = await fixture(),
      b = await fixture(undefined, "salon");
    await saveTurn(a.id, [
      { type: "tool_use", id: "call", name: "metrics", input: {} },
    ]);
    expect(await cachedTurn(b.id, "call")).toBeUndefined();
    expect(await cachedTurn(a.id, "call")).toHaveLength(1);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 86400001);
    try {
      expect(await cachedTurn(a.id, "call")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
    expect(await getDb().select().from(aiTurnCache)).toHaveLength(1);
  });
});
