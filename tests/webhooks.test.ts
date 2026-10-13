import { describe, expect, it, vi } from "vitest";
import { handleWebhook, type WebhookEvent } from "@/lib/paypal/webhooks";
const event = { id: "WH-ONE", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAPTURE", status: "COMPLETED", email_address: "private@example.com" }, extra: { keep: true } };
const headers = { "paypal-transmission-id": "id", "paypal-transmission-time": "time", "paypal-transmission-sig": "sig", "paypal-cert-url": "https://api.paypal.com/cert", "paypal-auth-algo": "SHA256withRSA" };
const request = (body: unknown = event, signed = true) => new Request("https://app.test/api/paypal/webhook", { method: "POST", headers: signed ? headers : {}, body: JSON.stringify(body) });
function deps(status = "SUCCESS") {
  return { webhookId: "webhook", allowUnverified: false, verify: vi.fn(async (body: unknown) => { void body; return { verification_status: status }; }), persist: vi.fn(async (event: WebhookEvent) => { void event; return true; }), log: vi.fn() };
}
describe("webhook receiver", () => {
  it("verifies a configured merchant webhook locally without merchant credentials",async () => { const d = deps("FAILURE"), localVerify = vi.fn(async (_raw: string,_headers: Headers,id: string) => id === "merchant-webhook"), webhookIds = vi.fn(async () => ["merchant-webhook"]);expect((await handleWebhook(request(),{ ...d,localVerify,webhookIds })).status).toBe(200);expect(d.persist).toHaveBeenCalledOnce();expect(d.verify).not.toHaveBeenCalled();expect(d.log.mock.calls[0][0]).toMatchObject({ verification_status: "SUCCESS" }); });
  it("keeps platform deliveries on the fast path",async () => { const d = deps(), webhookIds = vi.fn(async () => ["merchant-webhook"]);expect((await handleWebhook(request(),{ ...d,localVerify: async () => true,webhookIds })).status).toBe(200);expect(webhookIds).not.toHaveBeenCalled();expect(d.verify).not.toHaveBeenCalled(); });
  it("rejects signatures that match none of the configured registrations",async () => { const d = deps("FAILURE");expect((await handleWebhook(request(),{ ...d,localVerify: async () => false,webhookIds: async () => ["merchant-webhook"] })).status).toBe(400);expect(d.verify).toHaveBeenCalledTimes(2);expect(d.persist).not.toHaveBeenCalled(); });
  it("retries delivery when configured registration lookup is unavailable",async () => { const d = deps();expect((await handleWebhook(request(),{ ...d,localVerify: async () => false,webhookIds: async () => { throw new Error("Database unavailable"); } })).status).toBe(503);expect(d.persist).not.toHaveBeenCalled(); });
  it("verifies the complete original JSON and logs only identifiers", async () => {
    const d = deps();
    expect((await handleWebhook(request(), d)).status).toBe(200);
    expect(d.verify.mock.calls[0][0]).toMatchObject({ webhook_event: event, webhook_id: "webhook", transmission_sig: "sig" });
    expect(d.persist).toHaveBeenCalledWith(event);
    expect(JSON.stringify(d.log.mock.calls)).not.toContain("private@example.com");
    expect(d.log.mock.calls[0][0]).toMatchObject({ verification_status: "SUCCESS" });
  });
  it("rejects invalid signatures before persistence", async () => {
    const d = deps("FAILURE");
    expect((await handleWebhook(request(), d)).status).toBe(400);
    expect(d.persist).not.toHaveBeenCalled();
  });
  it("rejects missing headers and missing webhook ID", async () => {
    const d = deps();
    expect((await handleWebhook(request(event, false), d)).status).toBe(400);
    expect((await handleWebhook(request(), { ...d, webhookId: undefined })).status).toBe(400);
    expect(d.verify).not.toHaveBeenCalled();
  });
  it("returns 503 on verification or storage failure so PayPal can retry", async () => {
    const d = deps();
    d.verify.mockRejectedValueOnce(new Error("unavailable"));
    expect((await handleWebhook(request(), { ...d, allowUnverified: true })).status).toBe(503);
    d.persist.mockRejectedValueOnce(new Error("database"));
    expect((await handleWebhook(request(), d)).status).toBe(503);
  });
  it("accepts replays with a duplicate response", async () => {
    const d = deps(); d.persist.mockResolvedValue(false);
    expect(await (await handleWebhook(request(), d)).json()).toEqual({ ok: true, duplicate: true });
  });
  it("marks explicit simulator bypass distinctly", async () => {
    const d = deps();
    expect((await handleWebhook(request(event, false), { ...d, allowUnverified: true })).status).toBe(200);
    expect(d.log.mock.calls[0][0]).toMatchObject({ verification_status: "BYPASSED" });
  });
  it("rejects malformed or oversized events", async () => {
    const d = deps();
    const bad = new Request("https://app.test", { method: "POST", body: "{" });
    expect((await handleWebhook(bad, d)).status).toBe(400);
    expect((await handleWebhook(request({ resource: {} }), d)).status).toBe(400);
    expect((await handleWebhook(request({ ...event, large: "x".repeat(1024 * 1024) }), d)).status).toBe(413);
    expect(d.persist).not.toHaveBeenCalled();
  });
});
