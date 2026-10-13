import { randomUUID } from "node:crypto";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { POST } from "@/app/api/jobs/settle/route";
const { settle,after } = vi.hoisted(() => ({ settle: vi.fn(),after: vi.fn() }));
vi.mock("@/lib/rewards/executor",() => ({ settleReward: settle }));
vi.mock("next/server",() => ({ after }));
const bearer = "a".repeat(32);
const post = (body: unknown,authorized = true) => new Request("https://app.test/api/jobs/settle",{ method: "POST",headers: { "Content-Type": "application/json",...(authorized ? { Authorization: `Bearer ${bearer}` } : {}) },body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); for (const [key,value] of Object.entries({ KICKBACK_ENV: "sandbox",DEMO_MODE: "true",DATABASE_URL: "postgres://test:test@localhost/test",APP_URL: "https://app.test",PAYPAL_CLIENT_ID: "client",PAYPAL_CLIENT_SECRET: "secret",KICKBACK_MASTER_KEY: Buffer.alloc(32,1).toString("base64"),JOBS_BEARER: bearer })) vi.stubEnv(key,value); });
afterEach(() => { vi.unstubAllEnvs();vi.restoreAllMocks(); });
describe("sandbox refund interruption",() => {
 it("requires sandbox tools and a valid bearer before execution",async () => { const body = { id: randomUUID(),interrupt: true,killProcess: true }; expect((await POST(post(body,false))).status).toBe(401);vi.stubEnv("KICKBACK_ENV","live");expect((await POST(post(body))).status).toBe(404);expect(settle).not.toHaveBeenCalled();expect(after).not.toHaveBeenCalled(); });
 it("rejects process kills without real interrupted refunds",async () => { const id = randomUUID(); expect((await POST(post({ id,killProcess: true }))).status).toBe(400);expect((await POST(post({ id,interrupt: true,killProcess: true,mockCode: "PENDING_CAPTURE" }))).status).toBe(400);expect(settle).not.toHaveBeenCalled(); });
 it("never schedules a kill when no refund was accepted",async () => { settle.mockResolvedValue({ claimed: false });expect((await POST(post({ id: randomUUID(),interrupt: true,killProcess: true }))).status).toBe(200);expect(after).not.toHaveBeenCalled(); });
 it("kills only after the sandbox response when the refund result was discarded",async () => { const id = randomUUID(), kill = vi.spyOn(process,"kill").mockReturnValue(true);settle.mockResolvedValue({ claimed: true,interrupted: true,refundId: "SANDBOX_REFUND" });const response = await POST(post({ id,interrupt: true,killProcess: true }));expect(response.status).toBe(200);expect(settle).toHaveBeenCalledWith(id,expect.objectContaining({ interruptAfterResponse: true }));expect(kill).not.toHaveBeenCalled();expect(after).toHaveBeenCalledTimes(1);after.mock.calls[0][0]();expect(kill).toHaveBeenCalledWith(process.pid,"SIGKILL"); });
});
