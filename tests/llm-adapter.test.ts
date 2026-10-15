import { describe, it, expect } from "vitest";
import type { AgAiConversationItem } from "ag-studio";
import type {
  Message,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages";
import { encodeInput, toClaudeSchema } from "@/lib/studio/llm/encode";
import { eventMapper, finalResponse } from "@/lib/studio/llm/events";
const input = (items: unknown[]) => items as AgAiConversationItem[];
describe("Claude Studio protocol", () => {
  it("folds system input and batches parallel tool results", async () => {
    const r = await encodeInput(
      input([
        {
          type: "message",
          role: "system",
          content: [{ type: "text", text: "instructions" }],
        },
        {
          type: "message",
          role: "user",
          content: [{ type: "text", text: "question" }],
        },
        { type: "function_call", callId: "a", name: "one", arguments: "{}" },
        { type: "function_call", callId: "b", name: "two", arguments: "{}" },
        { type: "function_call_output", callId: "a", output: "1" },
        { type: "function_call_output", callId: "b", output: "2" },
      ]),
    );
    expect(r.system).toBe("instructions");
    expect(r.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(r.messages[2].content).toHaveLength(2);
  });
  it("restores the complete signed assistant turn only once", async () => {
    const cache = [
      {
        type: "thinking" as const,
        thinking: "summary",
        signature: "signature",
      },
      { type: "tool_use" as const, id: "a", name: "one", input: {} },
      { type: "tool_use" as const, id: "b", name: "two", input: {} },
    ];
    const r = await encodeInput(
      input([
        { type: "function_call", callId: "a", name: "one", arguments: "{}" },
        { type: "function_call", callId: "b", name: "two", arguments: "{}" },
      ]),
      async () => cache,
    );
    expect(r.messages[1].content).toEqual(cache);
    expect(r.messages).toHaveLength(2);
  });
  it("does not restore foreign or altered tool content", async () => {
    const r = await encodeInput(
      input([
        {
          type: "function_call",
          callId: "a",
          name: "one",
          arguments: '{"x":2}',
        },
      ]),
      async () => [{ type: "tool_use", id: "a", name: "one", input: { x: 1 } }],
    );
    expect(JSON.stringify(r.messages)).toContain('"x":2');
  });
  it("strips optional sentinels and keeps standard references", () => {
    const s = toClaudeSchema({
      type: "object",
      properties: { x: { anyOf: [{ $ref: "#/$defs/T" }, { not: {} }] } },
      required: ["x"],
      $defs: { T: { type: "number" } },
    });
    expect(s.required).toEqual([]);
    expect(s.properties).toEqual({ x: { $ref: "#/$defs/T" } });
    expect(s.$defs).toBeDefined();
  });
  it("keeps a root command anyOf", () =>
    expect(
      toClaudeSchema({ anyOf: [{ type: "object" }, { type: "null" }] }).anyOf,
    ).toHaveLength(2));
  it("maps text and tool args without run boundaries or signatures", () => {
    const map = eventMapper(),
      send = (e: unknown) => map(e as RawMessageStreamEvent);
    expect(
      send({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text" },
      })[0].type,
    ).toBe("TEXT_MESSAGE_START");
    expect(
      send({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "hi" },
      })[0],
    ).toMatchObject({ delta: "hi" });
    expect(send({ type: "content_block_stop", index: 0 })[0].type).toBe(
      "TEXT_MESSAGE_END",
    );
    expect(
      send({
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "a", name: "metrics" },
      })[0].type,
    ).toBe("TOOL_CALL_START");
    expect(
      send({
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: "{}" },
      })[0].type,
    ).toBe("TOOL_CALL_ARGS");
    expect(
      send({
        type: "content_block_delta",
        index: 1,
        delta: { type: "signature_delta", signature: "secret" },
      }),
    ).toEqual([]);
  });
  it.each([
    ["refusal", "failed"],
    ["max_tokens", "incomplete"],
    ["tool_use", "completed"],
    ["end_turn", "completed"],
  ])("maps termination %s", (stop_reason, status) =>
    expect(
      finalResponse({
        id: "msg",
        content: [],
        stop_reason,
        usage: { input_tokens: 10, output_tokens: 4 },
        model: "test",
      } as unknown as Message).status,
    ).toBe(status),
  );
});
