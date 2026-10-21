import { z } from "zod";
import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiCalls, connections } from "@/db/schema";
import { fixture, resetDb, setupDb, teardownDb } from "./helpers/db";
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { parse };
  },
}));
import {
  AiBudgetExhausted,
  AiNeedsConnection,
  AiQuotaExceeded,
  AiUnavailable,
  aiBlocker,
  budgetPausedUntil,
  isSpendLimitError,
  reserveAiCall,
  structured,
} from "@/lib/ai/client";
const viewer = (key: string) => ({ kind: "viewer" as const, key });
describe("AI lanes, caps and the spend limit", () => {
  beforeAll(setupDb);
  afterAll(teardownDb);
  beforeEach(async () => {
    await resetDb();
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-key");
    vi.stubEnv("AI_ENABLED", "true");
    vi.stubEnv("AI_MAX_ANALYST_TURNS_PER_MERCHANT_PER_DAY", "2");
    vi.stubEnv("AI_MAX_VIEWER_TURNS_PER_IP_PER_DAY", "2");
    vi.stubEnv("AI_MAX_VIEWER_TURNS_PER_DAY", "3");
    vi.stubEnv("AI_MAX_ANALYST_TURNS_GLOBAL_PER_DAY", "400");
    vi.stubEnv("PROTECTED_DEMO_SLUGS", "");
    parse.mockReset();
  });
  it("keeps demo visitors on their own per-network and total caps, apart from the owner's quota", async () => {
    const m = await fixture();
    await reserveAiCall(m.id, "analyst", undefined, viewer("a"));
    await reserveAiCall(m.id, "analyst", undefined, viewer("a"));
    await expect(reserveAiCall(m.id, "analyst", undefined, viewer("a"))).rejects.toBeInstanceOf(AiQuotaExceeded);
    await reserveAiCall(m.id, "analyst", undefined, viewer("b"));
    await expect(reserveAiCall(m.id, "analyst", undefined, viewer("c"))).rejects.toBeInstanceOf(AiQuotaExceeded);
    // The business still has its whole quota.
    await reserveAiCall(m.id, "analyst");
    await reserveAiCall(m.id, "analyst");
    await expect(reserveAiCall(m.id, "analyst")).rejects.toBeInstanceOf(AiQuotaExceeded);
    const rows = await getDb().select().from(aiCalls);
    expect(rows.filter((r) => r.actorKind === "viewer")).toHaveLength(3);
    expect(rows.filter((r) => r.actorKind === "owner" && r.actorKey === null)).toHaveLength(2);
  });
  it("lets demo visitors use only the Analyst", async () => {
    const m = await fixture();
    await expect(reserveAiCall(m.id, "designer", undefined, viewer("a"))).rejects.toBeInstanceOf(AiUnavailable);
  });
  it("caps every lane platform-wide", async () => {
    vi.stubEnv("AI_MAX_CALLS_GLOBAL_PER_DAY", "1");
    const a = await fixture(),
      b = await fixture(undefined, "second");
    await reserveAiCall(a.id, "designer");
    await expect(reserveAiCall(b.id, "designer")).rejects.toMatchObject({ message: "AI_GLOBAL_LIMIT" });
  });
  it("needs a connected PayPal account unless the shop is a protected demo", async () => {
    const m = await fixture();
    await getDb().update(connections).set({ status: "PENDING" }).where(eq(connections.merchantId, m.id));
    await expect(reserveAiCall(m.id, "analyst")).rejects.toBeInstanceOf(AiNeedsConnection);
    expect(await aiBlocker(m)).toBe("connect");
    vi.stubEnv("PROTECTED_DEMO_SLUGS", "rosas");
    await expect(reserveAiCall(m.id, "analyst")).resolves.toBeTruthy();
    expect(await aiBlocker(m)).toBeNull();
  });
  it("maps Anthropic spend-limit errors, pauses AI and never retries", async () => {
    expect(isSpendLimitError({ status: 400, error: { error: { type: "invalid_request_error", message: "You have reached your specified API usage limits." } } })).toBe(true);
    expect(isSpendLimitError({ status: 429, error: { error: { type: "rate_limit_error", message: "enforced_spend_limit_reached" } } })).toBe(true);
    expect(isSpendLimitError({ status: 429, error: { error: { type: "rate_limit_error", message: "Too many requests" } } })).toBe(false);
    expect(isSpendLimitError({ status: 400, error: { error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } } })).toBe(true);
    expect(isSpendLimitError({ status: 400, message: "Invalid schema" })).toBe(false);
    const m = await fixture();
    parse.mockRejectedValue(
      Object.assign(new Error("400 You have reached your specified API usage limits."), { status: 400 }),
    );
    const call = () =>
      structured({ merchantId: m.id, feature: "designer", system: "s", user: "u", schema: z.object({ a: z.number() }), effort: "low" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(call()).rejects.toBeInstanceOf(AiBudgetExhausted);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(await budgetPausedUntil()).toBeInstanceOf(Date);
    await expect(call()).rejects.toBeInstanceOf(AiBudgetExhausted);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(await aiBlocker(m)).toBe("budget");
    const [row] = await getDb().select().from(aiCalls);
    expect(row.status).toBe("BUDGET");
  });
});
