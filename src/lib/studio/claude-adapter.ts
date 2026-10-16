import type { AgLlmAdapter, AgLlmResponse, AgAiEvent } from "ag-studio";
export function claudeAdapter(
  onError?: (message: string) => void,
): AgLlmAdapter {
  return {
    executeTurn(request, options) {
      let resolve!: (v: AgLlmResponse) => void, reject!: (e: Error) => void;
      const complete = new Promise<AgLlmResponse>((a, b) => {
        resolve = a;
        reject = b;
      });
      complete.catch(() => {});
      async function* stream() {
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
          ended = false;
        try {
          const res = await fetch("/api/llm/turn", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...request, trace: options?.trace }),
            signal: options?.signal,
          });
          if (!res.ok || !res.body)
            throw new Error(`Analyst unavailable (${res.status}).`);
          reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const chunk = await reader.read();
            buffer += decoder.decode(chunk.value, { stream: !chunk.done });
            let index;
            while ((index = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, index);
              buffer = buffer.slice(index + 1);
              if (!line.trim()) continue;
              const item = JSON.parse(line);
              if (item.done) {
                ended = true;
                resolve(item.done);
              } else if (item.error) throw new Error(item.error);
              else yield item as AgAiEvent;
            }
            if (chunk.done) break;
          }
          if (!ended)
            throw new Error("Analyst stream ended unexpectedly. Try again.");
        } catch (e) {
          const err = e instanceof Error ? e : new Error("Analyst unavailable");
          reject(err);
          onError?.(err.message);
        } finally {
          await reader?.cancel().catch(() => {});
          if (!ended) reject(new Error("Analyst turn cancelled"));
        }
      }
      return { stream: { [Symbol.asyncIterator]: stream }, complete };
    },
  };
}
