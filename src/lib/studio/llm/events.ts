import type { AgAiEvent, AgLlmResponse, AgAiOutputItem } from "ag-studio";
import type {
  Message,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages";
export function eventMapper() {
  const blocks = new Map<number, { type: string; id: string }>();
  return (e: RawMessageStreamEvent): AgAiEvent[] => {
    if (e.type === "content_block_start") {
      const b = e.content_block;
      const id =
        b.type === "tool_use"
          ? b.id
          : `${b.type === "thinking" ? "rsn" : "msg"}_${e.index}`;
      blocks.set(e.index, { type: b.type, id });
      if (b.type === "text")
        return [
          { type: "TEXT_MESSAGE_START", messageId: id, role: "assistant" },
        ];
      if (b.type === "thinking")
        return [{ type: "REASONING_MESSAGE_START", messageId: id }];
      if (b.type === "tool_use")
        return [
          { type: "TOOL_CALL_START", toolCallId: id, toolCallName: b.name },
        ];
    }
    if (e.type === "content_block_delta") {
      const b = blocks.get(e.index);
      if (!b) return [];
      if (e.delta.type === "text_delta")
        return [
          {
            type: "TEXT_MESSAGE_CONTENT",
            messageId: b.id,
            delta: e.delta.text,
          },
        ];
      if (e.delta.type === "thinking_delta")
        return [
          {
            type: "REASONING_MESSAGE_CONTENT",
            messageId: b.id,
            delta: e.delta.thinking,
          },
        ];
      if (e.delta.type === "input_json_delta")
        return [
          {
            type: "TOOL_CALL_ARGS",
            toolCallId: b.id,
            delta: e.delta.partial_json,
          },
        ];
      return []; // Signatures stay server-side, preserved only in the tenant cache.
    }
    if (e.type === "content_block_stop") {
      const b = blocks.get(e.index);
      if (!b) return [];
      if (b.type === "text")
        return [{ type: "TEXT_MESSAGE_END", messageId: b.id }];
      if (b.type === "thinking")
        return [{ type: "REASONING_MESSAGE_END", messageId: b.id }];
      if (b.type === "tool_use")
        return [{ type: "TOOL_CALL_END", toolCallId: b.id }];
    }
    return []; // Do not forward provider envelopes or raw thinking signatures.
  };
}
export function finalResponse(message: Message): AgLlmResponse {
  const output: AgAiOutputItem[] = [];
  message.content.forEach((b, i) => {
    if (b.type === "text")
      output.push({
        kind: "output",
        type: "message",
        id: `msg_${i}`,
        role: "assistant",
        status: "completed",
        content: [{ type: "text", text: b.text, annotations: [] }],
      });
    if (b.type === "tool_use")
      output.push({
        kind: "output",
        type: "function_call",
        id: b.id,
        callId: b.id,
        name: b.name,
        arguments: JSON.stringify(b.input),
        status: "completed",
      });
    if (b.type === "thinking")
      output.push({
        kind: "output",
        type: "reasoning",
        id: `rsn_${i}`,
        summary: [{ type: "summary", text: b.thinking }],
      });
  });
  return {
    id: message.id,
    createdAt: Date.now(),
    output,
    status:
      message.stop_reason === "refusal"
        ? "failed"
        : message.stop_reason === "max_tokens"
          ? "incomplete"
          : "completed",
    ...(message.stop_reason === "refusal"
      ? {
          error: {
            code: "refusal",
            message: "The request could not be answered.",
          },
        }
      : {}),
    ...(message.stop_reason === "max_tokens"
      ? { incompleteDetails: { reason: "max_output_tokens" as const } }
      : {}),
    usage: {
      inputTokens:
        message.usage.input_tokens +
        (message.usage.cache_read_input_tokens ?? 0) +
        (message.usage.cache_creation_input_tokens ?? 0),
      outputTokens: message.usage.output_tokens,
      cachedInputTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    },
    model: message.model,
  };
}
