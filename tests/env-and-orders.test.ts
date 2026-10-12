import { afterEach, describe, expect, it, vi } from "vitest";
import { envSchema } from "@/lib/env";
import { signOrderToken, verifyOrderToken } from "@/lib/crypto/order-token";
import { createOrderSchema } from "@/lib/paypal/orders";
import { validateCandidates } from "@/lib/ai/designer";
const env = { DATABASE_URL: "postgres://test:test@localhost/test", PAYPAL_CLIENT_ID: "client", PAYPAL_CLIENT_SECRET: "secret", KICKBACK_MASTER_KEY: Buffer.alloc(32, 1).toString("base64"), JOBS_BEARER: "a".repeat(32), KICKBACK_ENV: "sandbox" };
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("configuration and order context", () => {
  it("rejects missing secrets, invalid booleans, and live bypass", () => {
    expect(envSchema.safeParse({}).success).toBe(false);
    expect(envSchema.safeParse({ ...env, DEMO_MODE: "yes" }).success).toBe(false);
    expect(envSchema.safeParse({ ...env, KICKBACK_ENV: "live", APP_URL: "https://app.test", KICKBACK_ALLOW_UNVERIFIED_WEBHOOKS: "true" }).success).toBe(false);
    expect(envSchema.parse({ ...env, PAYPAL_WEBHOOK_ID: "" }).PAYPAL_WEBHOOK_ID).toBeUndefined();
  });
  it("accepts bounded decimal amounts and an allowlisted merchant", () => {
    const requestId = "a0772068-0000-4000-8000-123456789012";
    expect(createOrderSchema.parse({ amount: "10.00", requestId }).merchant).toBe("platform");
    for (const amount of ["0.99", "500.01", "NaN", "1e2", "2.001", "-1.00"]) expect(createOrderSchema.safeParse({ amount, requestId }).success).toBe(false);
    expect(createOrderSchema.safeParse({ amount: "10.00", merchant: "unknown", requestId }).success).toBe(false);
  });
  it("binds merchant and order, detects tampering, and expires tokens", () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("KICKBACK_ALLOW_UNVERIFIED_WEBHOOKS", "false");
    const data = { orderId: "ORDER123456789", merchant: "rosas" as const, requestId: "a0772068-0000-4000-8000-123456789012" };
    const token = signOrderToken(data);
    expect(verifyOrderToken(token)).toMatchObject(data);
    const encoded = Buffer.from(JSON.stringify({ ...data, merchant: "bakery", expiresAt: Date.now() + 10000 })).toString("base64url");
    expect(() => verifyOrderToken(`${encoded}.${token.split(".")[1]}`)).toThrow("Invalid order token");
    vi.useFakeTimers(); vi.advanceTimersByTime(6 * 3600000 + 1);
    expect(() => verifyOrderToken(token)).toThrow("Expired");
  });
  it("enforces program range and budget checks outside model schema", () => {
    const c = { name: "Coffee", type: "VISIT_MILESTONE", n: 5, reward_cents: 200, window_days: 30, min_ticket_cents: 500, per_customer_monthly_cap_cents: 1000, monthly_budget_cents: 15000, rationale: "Thank regulars", who_it_favors: "all" };
    expect(validateCandidates({ candidates: [c, c, c] }).candidates).toHaveLength(3);
    expect(() => validateCandidates({ candidates: [c, { ...c, reward_cents: -100 }, c] })).toThrow("constraints");
    expect(() => validateCandidates({ candidates: [c] })).toThrow("three");
  });
});
