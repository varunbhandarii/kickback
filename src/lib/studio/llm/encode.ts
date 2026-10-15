import type { AgAiConversationItem } from "ag-studio";
import type {
  ContentBlockParam,
  MessageParam,
} from "@anthropic-ai/sdk/resources/messages";
export type CacheLookup = (
  id: string,
) => Promise<ContentBlockParam[] | undefined>;
export function toClaudeSchema(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>,
      result: Record<string, unknown> = {};
    const optional = (x: unknown) =>
      !!x &&
      typeof x === "object" &&
      Array.isArray((x as Record<string, unknown>).anyOf) &&
      ((x as Record<string, unknown>).anyOf as unknown[]).some(
        (y) =>
          !!y &&
          typeof y === "object" &&
          Object.hasOwn(y, "not") &&
          JSON.stringify((y as Record<string, unknown>).not) === "{}",
      );
    for (const [k, x] of Object.entries(o)) {
      if (k === "required" && Array.isArray(x)) {
        const props = (o.properties ?? {}) as Record<string, unknown>;
        result[k] = x.filter(
          (name) => typeof name === "string" && !optional(props[name]),
        );
      } else if (k === "properties" && x && typeof x === "object")
        result[k] = Object.fromEntries(
          Object.entries(x).map(([name, p]) => [
            name,
            optional(p)
              ? walk(
                  ((p as Record<string, unknown>).anyOf as unknown[]).find(
                    (y) =>
                      !(y && typeof y === "object" && Object.hasOwn(y, "not")),
                  ),
                )
              : walk(p),
          ]),
        );
      else result[k] = walk(x);
    }
    return result;
  };
  return walk(value) as Record<string, unknown>;
}
export async function encodeInput(
  items: AgAiConversationItem[],
  lookup: CacheLookup = async () => undefined,
) {
  const messages: MessageParam[] = [],
    system: string[] = [],
    skip = new Set<string>();
  const append = (role: "user" | "assistant", block: ContentBlockParam) => {
    const last = messages.at(-1);
    if (last?.role === role && Array.isArray(last.content))
      last.content.push(block);
    else messages.push({ role, content: [block] });
  };
  for (const item of items) {
    if (item.type === "reasoning") continue;
    if (item.type === "message") {
      const text = item.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("\n");
      if (item.role === "system") {
        system.push(text);
        continue;
      }
      if (text) append(item.role, { type: "text", text });
    } else if (item.type === "function_call") {
      if (skip.has(item.callId)) continue;
      const cached = await lookup(item.callId);
      if (cached) {
        const calls = cached.filter((b) => b.type === "tool_use");
        // Never resurrect calls absent from the supplied conversation.
        if (
          calls.every((c) =>
            items.some(
              (i) =>
                i.type === "function_call" &&
                i.callId === c.id &&
                i.name === c.name &&
                JSON.stringify(JSON.parse(i.arguments || "{}")) ===
                  JSON.stringify(c.input),
            ),
          )
        ) {
          for (const c of calls) skip.add(c.id);
          const last = messages.at(-1);
          if (last?.role === "assistant") messages.pop();
          messages.push({ role: "assistant", content: cached });
          continue;
        }
      }
      append("assistant", {
        type: "tool_use",
        id: item.callId,
        name: item.name,
        input: JSON.parse(item.arguments || "{}"),
      });
    } else
      append("user", {
        type: "tool_result",
        tool_use_id: item.callId,
        content: item.output,
      });
  }
  if (!messages.length || messages[0].role !== "user")
    messages.unshift({
      role: "user",
      content: "Continue this business analysis.",
    });
  return { messages, system: system.join("\n") };
}
