import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { createReferral } from "@/lib/paypal/referrals";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/paypal/client",() => ({ paypalFetch: request }));
beforeEach(() => { vi.clearAllMocks();for (const [key,value] of Object.entries({ KICKBACK_ENV: "sandbox",DATABASE_URL: "postgres://test:test@localhost/test",APP_URL: "https://app.test",PAYPAL_CLIENT_ID: "client",PAYPAL_CLIENT_SECRET: "secret",KICKBACK_MASTER_KEY: Buffer.alloc(32,1).toString("base64"),JOBS_BEARER: "a".repeat(32) })) vi.stubEnv(key,value);request.mockResolvedValue({ links: [] }); });
afterEach(() => vi.unstubAllEnvs());
it("requests seller dispute access alongside the payment/refund grant",async () => { await createReferral("merchant-link");expect(request).toHaveBeenCalledWith("/v2/customer/partner-referrals",expect.objectContaining({ method: "POST",body: expect.objectContaining({ tracking_id: "merchant-link",operations: [{ operation: "API_INTEGRATION",api_integration_preference: { rest_api_integration: { integration_method: "PAYPAL",integration_type: "THIRD_PARTY",third_party_details: { features: expect.arrayContaining(["PAYMENT","REFUND","READ_SELLER_DISPUTE","UPDATE_SELLER_DISPUTE"]) } } } }] }) })); });
