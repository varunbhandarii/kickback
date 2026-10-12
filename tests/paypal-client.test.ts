import { describe, expect, it, vi } from "vitest";
import { authAssertion } from "@/lib/paypal/auth";
import { createPayPalClient, PayPalApiError } from "@/lib/paypal/client";
const oauth = () => Response.json({ access_token: "test-token", expires_in: 120, scope: "test-scope" });
const config = { clientId: "partner", clientSecret: "secret", environment: "sandbox" as const };
const noPacing = async () => {};
describe("PayPal transport", () => {
  it("bounds a worker waiting on another request's OAuth refresh",async () => { vi.useFakeTimers(); try { const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => { if (String(url).endsWith("/token")) { await new Promise((resolve) => setTimeout(resolve,1000)); return oauth(); } return Response.json({ id: "ok" }); }); const client = createPayPalClient(config,{ fetch: fetcher,pace: noPacing }), normal = client.request("/v2/checkout/orders/normal"); await vi.advanceTimersByTimeAsync(0); const expected = expect(client.request("/v2/checkout/orders/worker",{ deadline: Date.now()+100 })).rejects.toThrow("deadline"); await vi.advanceTimersByTimeAsync(100); await expected; await vi.advanceTimersByTimeAsync(900); await normal; expect(fetcher).toHaveBeenCalledTimes(2); } finally { vi.useRealTimers(); } });
  it("sends multipart dispute input without forcing a JSON content type",async () => { const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(oauth()).mockResolvedValueOnce(Response.json({ dispute_id: "CASE1" })); const client = createPayPalClient(config,{ fetch: fetcher,pace: noPacing }), form = new FormData(); form.append("input",new Blob(['{"reason":"OTHER"}'],{ type: "application/json" })); await client.request("/v1/customer/disputes",{ method: "POST",body: form }); const init = fetcher.mock.calls[1][1]; expect(init?.body).toBe(form); expect(new Headers(init?.headers).has("Content-Type")).toBe(false); });
  it("uses standard padded Base64 and the required trailing dot", () => {
    const assertion = authAssertion("partner", "ABCDEFGHIJKLM");
    const [head, body, signature] = assertion.split(".");
    expect(JSON.parse(Buffer.from(head, "base64").toString())).toEqual({ alg: "none" });
    expect(body).toBe(Buffer.from(JSON.stringify({ iss: "partner", payer_id: "ABCDEFGHIJKLM" })).toString("base64"));
    expect(signature).toBe("");
  });
  it("coalesces concurrent token requests and refreshes before expiry", async () => {
    let now = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => String(url).endsWith("/token") ? oauth() : Response.json({ id: "ok" }));
    const client = createPayPalClient(config, { fetch: fetcher, now: () => now, pace: noPacing });
    await Promise.all([client.request("/v2/checkout/orders/one"), client.request("/v2/checkout/orders/two")]);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/token"))).toHaveLength(1);
    now = 61000;
    await client.request("/v2/checkout/orders/three");
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/token"))).toHaveLength(2);
  });
  it("retries 429 and 5xx with one request ID and merchant headers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(oauth())
      .mockResolvedValueOnce(Response.json({ name: "RATE_LIMIT" }, { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ id: "captured" }));
    const sleep = vi.fn(async () => {});
    const client = createPayPalClient({ ...config, bnCode: "BN" }, { fetch: fetcher, sleep, pace: noPacing });
    expect(await client.request("/v2/checkout/orders/one/capture", { method: "POST", merchantId: "ABCDEFGHIJKLM", mockCode: "TEST_CODE" })).toEqual({ id: "captured" });
    const calls = fetcher.mock.calls.slice(1);
    const headers = calls.map(([, init]) => init?.headers as Record<string, string>);
    expect(new Set(headers.map((h) => h["PayPal-Request-Id"])).size).toBe(1);
    expect(headers[0]).toMatchObject({ Authorization: "Bearer test-token", "PayPal-Partner-Attribution-Id": "BN", "PayPal-Auth-Assertion": authAssertion("partner", "ABCDEFGHIJKLM"), Prefer: "return=representation" });
    expect(sleep).toHaveBeenCalledWith(2000);
  });
  it("does not retry validation errors and preserves debug IDs without logging sensitive details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(oauth()).mockResolvedValueOnce(Response.json({ name: "UNPROCESSABLE_ENTITY", debug_id: "debug-123", details: [{ issue: "REFUND_AMOUNT_EXCEEDED", description: "payer@example.com" }] }, { status: 422 }));
    const client = createPayPalClient(config, { fetch: fetcher, pace: noPacing });
    const error = await client.request("/v2/payments/captures/one/refund", { method: "POST" }).catch((e) => e);
    expect(error).toBeInstanceOf(PayPalApiError);
    expect((error as PayPalApiError).toJSON()).toEqual({ status: 422, name: "UNPROCESSABLE_ENTITY", debug_id: "debug-123", details: [{ issue: "REFUND_AMOUNT_EXCEEDED" }] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("retries network failures without changing the request ID", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(oauth()).mockRejectedValueOnce(new TypeError("network")).mockResolvedValueOnce(Response.json({ ok: true }));
    const client = createPayPalClient(config, { fetch: fetcher, pace: noPacing, sleep: noPacing });
    await client.request("/v2/payments/captures/one/refund", { method: "POST", requestId: "stable" });
    expect((fetcher.mock.calls[1][1]?.headers as Record<string,string>)["PayPal-Request-Id"]).toBe("stable");
    expect((fetcher.mock.calls[2][1]?.headers as Record<string,string>)["PayPal-Request-Id"]).toBe("stable");
  });
  it("refuses sandbox mock headers in live mode", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createPayPalClient({ ...config, environment: "live" }, { fetch: fetcher });
    await expect(client.request("/v2/payments/captures/one/refund", { mockCode: "TEST" })).rejects.toThrow("sandbox-only");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
