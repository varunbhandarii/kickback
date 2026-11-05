import { vi, describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { connections, demoBuyers, merchantUsers, merchants, user } from "@/db/schema";
import { fixture, resetDb, setupDb, teardownDb } from "./helpers/db";
import { PayPalScheduler, THROTTLE_PAUSE_MS } from "@/lib/paypal/pacing";
import { disconnectMerchant, ProtectedDemoTenant } from "@/lib/merchant-actions";
import { purgeTenants } from "@/lib/db/purge-tenants";
import { seedDemo } from "@/lib/db/seed-demo";
import { serviceStatus } from "@/lib/status";
import { beat, lastBeat } from "@/lib/heartbeat";
import { takeLease, dropLease } from "@/lib/lease";
import { upsertBuyer } from "@/lib/demo/buyers";
import { recordThrottle, recentThrottles } from "@/lib/paypal/throttle-log";
import { DEMO_VIEWER_EMAIL } from "@/lib/demo/accounts";

describe("PayPal 429 backoff", () => {
  afterEach(() => vi.useRealTimers());
  it("holds background work five minutes and checkout thirty seconds after a throttle", async () => {
    vi.useFakeTimers();
    const scheduler = new PayPalScheduler();
    scheduler.throttle();
    const done: string[] = [];
    const high = scheduler.take("high").then(() => done.push("high"));
    const low = scheduler.take("low").then(() => done.push("low"));
    await vi.advanceTimersByTimeAsync(THROTTLE_PAUSE_MS.high - 1000);
    expect(done).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    await high;
    expect(done).toEqual(["high"]);
    await vi.advanceTimersByTimeAsync(THROTTLE_PAUSE_MS.low - THROTTLE_PAUSE_MS.high - 5000);
    expect(done).toEqual(["high"]);
    await vi.advanceTimersByTimeAsync(10000);
    await low;
    expect(done).toEqual(["high", "low"]);
    scheduler.reset();
  });
});

describe("demo operations", () => {
  beforeAll(setupDb);
  afterAll(teardownDb);
  beforeEach(async () => {
    await resetDb();
    await getDb().delete(user);
  });
  it("refuses to disconnect or purge a protected demo shop unless an operator allows it", async () => {
    vi.stubEnv("PROTECTED_DEMO_SLUGS", "rosas");
    const m = await fixture();
    await getDb().insert(user).values({ id: "u1", name: "Owner", email: "o@example.com" });
    await getDb().insert(merchantUsers).values({ userId: "u1", merchantId: m.id });
    await expect(disconnectMerchant("u1", m.id)).rejects.toBeInstanceOf(ProtectedDemoTenant);
    await getDb().update(merchants).set({ purgeAfter: new Date(Date.now() - 1000) }).where(eq(merchants.id, m.id));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await purgeTenants()).toBe(0);
    expect(await getDb().select().from(connections)).toHaveLength(1);
    vi.stubEnv("ALLOW_DEMO_TENANT_PURGE", "true");
    expect(await purgeTenants()).toBe(1);
    vi.stubEnv("ALLOW_DEMO_TENANT_PURGE", "false");
    vi.stubEnv("PROTECTED_DEMO_SLUGS", "");
  });
  it("seeds the read-only visitor and reports skipped shops instead of calling them seeded", async () => {
    for (const prefix of ["ROSAS", "SALON", "BAKERY"]) {
      vi.stubEnv(`MERCHANT_${prefix}_ID`, "MERCHANT12345");
      vi.stubEnv(`MERCHANT_${prefix}_CONNECTION_MODE`, "partner");
    }
    vi.stubEnv("DEMO_VIEWER_PASSWORD", "viewer-password-for-tests");
    expect(await seedDemo()).toMatchObject({ seeded: ["rosas", "salon", "bakery"], skipped: [], viewer: true });
    const [viewer] = await getDb().select().from(user).where(eq(user.email, DEMO_VIEWER_EMAIL));
    const roles = await getDb().select().from(merchantUsers).where(eq(merchantUsers.userId, viewer.id));
    expect(roles.map((r) => r.role)).toEqual(["VIEWER", "VIEWER", "VIEWER"]);
    await getDb().update(merchants).set({ purgeAfter: new Date(Date.now() + 3600000) }).where(eq(merchants.slug, "salon"));
    expect(await seedDemo()).toMatchObject({
      seeded: ["rosas", "bakery"],
      skipped: [{ slug: "salon", reason: "scheduled for deletion" }],
    });
    vi.stubEnv("DEMO_VIEWER_PASSWORD", "");
  });
  it("shows status without any person, payment, wallet or key", async () => {
    const m = await fixture();
    await upsertBuyer({ slot: 3, email: "kb-demo-3@example.com" }, "VAULT-SECRET-ID");
    await beat("jobs");
    expect((await serviceStatus()).rows.find((r) => r.key === "reconcile")?.health).toBe("warn");
    // A reconciliation from the cron's sweep counts, not only the nightly workflow's.
    await getDb().update(connections).set({ lastReconciledAt: new Date() }).where(eq(connections.merchantId, m.id));
    const status = await serviceStatus();
    expect(status.rows.find((r) => r.key === "reconcile")).toMatchObject({ health: "ok", value: "just now" });
    const text = JSON.stringify(status);
    expect(status.rows.find((r) => r.key === "database")?.health).toBe("ok");
    expect(status.rows.find((r) => r.key === "jobs")?.health).toBe("ok");
    expect(text).not.toMatch(/@|VAULT|MERCHANT12345/);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(text).not.toContain(m.id);
    // No watch customer ready but plenty of paying ones: live runs still work.
    await getDb().update(demoBuyers).set({ status: "ready" });
    for (const slot of [4, 5, 6]) await upsertBuyer({ slot, email: `kb-demo-${slot}@example.com`, purpose: "pay" }, "VAULT-" + slot);
    await getDb().update(demoBuyers).set({ status: "ready" }).where(eq(demoBuyers.purpose, "pay"));
    await getDb().update(demoBuyers).set({ status: "cooling" }).where(eq(demoBuyers.purpose, "watch"));
    expect((await serviceStatus()).rows.find((r) => r.key === "demo_buyers")).toMatchObject({
      health: "ok",
      value: expect.stringMatching(/^4 for paying, 0 for watching, live runs use a paying one/),
    });
    await getDb().update(demoBuyers).set({ status: "cooling" }).where(inArray(demoBuyers.slot, [5, 6]));
    expect((await serviceStatus()).rows.find((r) => r.key === "demo_buyers")?.health).toBe("warn");
  });
  it("records heartbeats even when the uptime monitor is unreachable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await beat("soak", "https://uptime.example.test/beat");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await lastBeat("soak")).toBeInstanceOf(Date);
    fetchMock.mockRestore();
  });
  it("hands a lease to one holder at a time and counts PayPal throttles", async () => {
    expect(await takeLease("job", 60000)).toBe(true);
    expect(await takeLease("job", 60000)).toBe(false);
    expect(await takeLease("job", 60000, new Date(Date.now() + 61000))).toBe(true);
    await dropLease("job");
    expect(await takeLease("job", 60000)).toBe(true);
    await recordThrottle();
    await recordThrottle();
    expect(await recentThrottles()).toBe(2);
  });
});
