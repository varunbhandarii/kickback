import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signOrderToken } from "@/lib/crypto/order-token";
import { POST as capture } from "@/app/api/pay/capture-order/route";
import { POST as create } from "@/app/api/pay/create-order/route";
const { requestPayPal, createPayPal } = vi.hoisted(() => ({ requestPayPal: vi.fn(), createPayPal: vi.fn() }));
vi.mock("@/lib/paypal/merchants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paypal/merchants")>();
  return { ...actual, merchantContext: vi.fn(() => ({ client: { request: requestPayPal }, assertionMerchantId: "ABCDEFGHIJKLM" })) };
});
vi.mock("@/lib/paypal/orders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paypal/orders")>();
  return { ...actual, createOrder: createPayPal };
});
const requestId = "a0772068-0000-4000-8000-123456789012";
const orderId = "ORDER123456789";
const origin = "https://app.test";
const post = (body: unknown, requestOrigin = origin) => new Request(`${origin}/api/pay/capture-order`, { method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  for (const [key, value] of Object.entries({ APP_URL: origin, KICKBACK_ENV: "sandbox", DATABASE_URL: "postgres://test:test@localhost/test", PAYPAL_CLIENT_ID: "client", PAYPAL_CLIENT_SECRET: "secret", KICKBACK_MASTER_KEY: Buffer.alloc(32, 1).toString("base64"), JOBS_BEARER: "a".repeat(32), DEMO_MODE: "true", KICKBACK_ALLOW_UNVERIFIED_WEBHOOKS: "false" })) vi.stubEnv(key, value);
  requestPayPal.mockResolvedValue({ id: orderId, status: "COMPLETED", payment_source: { paypal: { account_id: "BUYER123" } }, purchase_units: [{ payments: { captures: [{ id: "CAPTURE123", status: "COMPLETED", amount: { value: "10.00", currency_code: "USD" } }] } }] });
  createPayPal.mockResolvedValue({ id: orderId });
});
afterEach(() => { vi.unstubAllEnvs(); });
describe("sandbox checkout API", () => {
  it("captures the signed order and repeats with the original request ID", async () => {
    const orderToken = signOrderToken({ orderId, merchant: "rosas", requestId });
    for (let n = 0; n < 2; n++) {
      const response = await capture(post({ orderId, orderToken }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ captureId: "CAPTURE123", captureStatus: "COMPLETED", accountId: "BUYER123" });
    }
    expect(requestPayPal.mock.calls).toHaveLength(2);
    for (const call of requestPayPal.mock.calls) expect(call).toEqual([`/v2/checkout/orders/${orderId}/capture`, { method: "POST", requestId, merchantId: "ABCDEFGHIJKLM" }]);
  });
  it("rejects mismatched or tampered context without moving funds", async () => {
    const orderToken = signOrderToken({ orderId, merchant: "rosas", requestId });
    expect((await capture(post({ orderId: "OTHER123456789", orderToken }))).status).toBe(400);
    expect((await capture(post({ orderId, orderToken: `${orderToken}x` }))).status).toBe(400);
    expect(requestPayPal).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests and disabled sandbox routes", async () => {
    expect((await create(post({}, "https://other.test"))).status).toBe(403);
    vi.stubEnv("DEMO_MODE", "false");
    expect((await create(post({}))).status).toBe(404);
    expect(createPayPal).not.toHaveBeenCalled();
  });
  it("validates amounts before creating an order", async () => {
    expect((await create(post({ amount: "500.01", requestId }))).status).toBe(400);
    expect(createPayPal).not.toHaveBeenCalled();
    const response = await create(post({ amount: "10.00", merchant: "rosas", requestId }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ orderId, orderToken: expect.any(String) });
    expect(createPayPal).toHaveBeenCalledWith({ amount: "10.00", merchant: "rosas", requestId });
  });
});
