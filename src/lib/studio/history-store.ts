import type { AgAiHistoryStore, AgAiThread } from "ag-studio";
export function historyStore(): AgAiHistoryStore {
  const listeners = new Set<
    Parameters<AgAiHistoryStore["addEventListener"]>[1]
  >();
  let channel: BroadcastChannel | undefined;
  let newest: { id: string; value: AgAiThread | undefined } | undefined;
  const notify = () => {
    for (const listener of listeners) listener({ type: "changed" });
  };
  const request = async (path: string, init?: RequestInit) => {
    const r = await fetch("/api/analyst/threads" + path, {
      ...init,
      cache: "no-store",
      headers: { "content-type": "application/json" },
    });
    if (r.status === 404) return undefined;
    if (!r.ok) throw new Error("Conversation unavailable");
    return r.json();
  };
  return {
    // Studio chooses the last entry as the newest conversation.
    listThreads: async () => {
      const summaries = await request("");
      const id = summaries[0]?.threadId;
      // Finish the first history read before publishing the roster. Otherwise
      // Studio can finish activating an old thread after the user clicks New.
      newest = id
        ? { id, value: await request("/" + encodeURIComponent(id)) }
        : undefined;
      return summaries.reverse();
    },
    loadThread: async (id) => {
      if (newest?.id === id) {
        const value = newest.value;
        newest = undefined;
        return value;
      }
      return request("/" + encodeURIComponent(id));
    },
    saveThread: async (t) => {
      await request("/" + encodeURIComponent(t.summary.threadId), {
        method: "PUT",
        body: JSON.stringify(t),
      });
      channel?.postMessage("changed");
    },
    deleteThread: async (id) => {
      await request("/" + encodeURIComponent(id), { method: "DELETE" });
      for (const l of listeners) l({ type: "changed" });
      channel?.postMessage("changed");
    },
    addEventListener: (_t, l) => {
      listeners.add(l);
      if (!channel && typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("kickback-cockpit-threads");
        channel.onmessage = notify;
      }
    },
    removeEventListener: (_t, l) => {
      listeners.delete(l);
      if (!listeners.size) {
        channel?.close();
        channel = undefined;
      }
    },
  };
}
