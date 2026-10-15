vi.mock("@/lib/dal", () => ({ getSession: vi.fn(), ownedMerchant: vi.fn() }));
import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), stream: vi.fn() }));
vi.mock("@/lib/studio/api-actor", async (original) => ({
  ...(await original<typeof import("@/lib/studio/api-actor")>()),
  apiActor: mocks.actor,
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: mocks.stream };
  },
}));
import { POST } from "@/app/api/llm/turn/route";
import { ApiError } from "@/lib/studio/api-actor";
import { reserveAiCall } from "@/lib/ai/client";
vi.mock("@/lib/dal", () => ({ getSession: vi.fn(), ownedMerchant: vi.fn() }));
import { getDb } from "@/db";
import { aiCalls } from "@/db/schema";
import { fixture, setupDb, resetDb, teardownDb } from "./helpers/db";
const body = {
  input: [
    {
      kind: "input",
      id: "u",
      type: "message",
      role: "user",
      status: "completed",
      content: [{ type: "text", text: "Count rewards" }],
    },
  ],
  responseFormat: { type: "text" },
  model: { id: "claude-opus-5-5", effort: "low" },
};
const request = (b: unknown = body) =>
  new Request("https://app.test/api/llm/turn", {
    method: "POST",
    body: JSON.stringify(b),
  });
describe("Analyst turn route", () => {
  beforeAll(setupDb);
  beforeEach(async () => {
    await resetDb();
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-key");
    vi.stubEnv("AI_ENABLED", "true");
    vi.stubEnv("AI_MAX_ANALYST_TURNS_PER_MERCHANT_PER_DAY", "2");
    const m = await fixture();
    mocks.actor.mockResolvedValue({
      merchantId: m.id,
      userId: "owner",
      merchant: m,
    });
    mocks.stream.mockReset();
  });
  afterAll(teardownDb);
  it.each([401, 403])("preserves authorization status %s", async (status) => {
    mocks.actor.mockRejectedValue(new ApiError(status, "Denied"));
    expect((await POST(request())).status).toBe(status);
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it("rejects invalid bodies and model/provider overrides", async () => {
    expect((await POST(request({}))).status).toBe(400);
    expect(
      (await POST(request({ ...body, model: { id: "arbitrary" } }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({
            ...body,
            tools: [
              {
                name: "browse",
                description: "external",
                kind: "provided",
                parameters: {},
              },
            ],
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("streams mapped events then resolves done and logs usage", async () => {
    const final = {
      id: "answer",
      content: [{ type: "text", text: "No rewards." }],
      stop_reason: "end_turn",
      model: "claude-opus-5-5",
      usage: { input_tokens: 10, output_tokens: 4 },
    };
    mocks.stream.mockReturnValue({
      request_id: "request-safe",
      async *[Symbol.asyncIterator]() {
        yield { type: "message_start", message: { usage: final.usage } };
        yield {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        };
        yield {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "No rewards." },
        };
        yield { type: "content_block_stop", index: 0 };
        yield { type: "message_delta", usage: { output_tokens: 4 } };
      },
      finalMessage: async () => final,
    });
    const r = await POST(request()),
      lines = (await r.text())
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
    expect(r.headers.get("content-type")).toBe("application/x-ndjson");
    expect(lines.some((l) => l.type === "TEXT_MESSAGE_CONTENT")).toBe(true);
    expect(lines.at(-1).done.status).toBe("completed");
    expect((await getDb().select().from(aiCalls))[0]).toMatchObject({
      feature: "analyst",
      status: "SUCCEEDED",
      inputTokens: 10,
      outputTokens: 4,
    });
  });
  it("has a separate durable quota and returns a failed done envelope", async () => {
    const actor = await mocks.actor();
    await reserveAiCall(actor.merchantId, "analyst");
    await reserveAiCall(actor.merchantId, "analyst");
    await reserveAiCall(actor.merchantId, "scribe.notes");
    const r = await POST(request()),
      last = JSON.parse((await r.text()).trim());
    expect(last.done.error.code).toBe("quota");
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it("logs cancellation and closes the stream safely", async () => {
    mocks.stream.mockImplementation(() => {
      throw new Error("provider unavailable");
    });
    const r = await POST(request());
    expect(await r.text()).toContain('"error"');
    expect((await getDb().select().from(aiCalls))[0].status).toBe("FAILED");
  });
  it("forwards abort and records a cancelled reservation", async () => {
    const controller = new AbortController();
    mocks.stream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        controller.abort();
        yield await Promise.reject(new Error("aborted"));
      },
      finalMessage: async () => undefined,
    });
    const req = new Request("https://app.test/api/llm/turn", {
      method: "POST",
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const response = await POST(req);
    await response.text();
    expect((await getDb().select().from(aiCalls))[0].status).toBe("CANCELLED");
    expect(mocks.stream.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
