import { afterEach, describe, expect, it, vi } from "vitest";
import { historyStore } from "@/lib/studio/history-store";
afterEach(() => vi.unstubAllGlobals());
const newest = { threadId: "new", agentId: "kickback-analyst", updatedAt: 2 };
const oldest = { ...newest, threadId: "old", updatedAt: 1 };
describe("Studio history activation", () => {
  it("does not publish a roster while its initial conversation is still loading", async () => {
    let release!: (r: Response) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json([newest, oldest]))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((r) => {
            release = r;
          }),
      );
    vi.stubGlobal("fetch", fetch);
    const store = historyStore();
    let published = false;
    const roster = store.listThreads().then((v) => {
      published = true;
      return v;
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(published).toBe(false);
    const thread = { summary: newest, messages: [] };
    release(Response.json(thread));
    expect(await roster).toEqual([oldest, newest]);
    expect(await store.loadThread("new")).toEqual(thread);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("reloads a conversation after its prefetched snapshot has been consumed", async () => {
    const first = { summary: newest, messages: [] };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json([newest]))
      .mockResolvedValueOnce(Response.json(first))
      .mockResolvedValueOnce(Response.json({ ...first, artifacts: [] }));
    vi.stubGlobal("fetch", fetch);
    const store = historyStore();
    await store.listThreads();
    await store.loadThread("new");
    expect(await store.loadThread("new")).toEqual({ ...first, artifacts: [] });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("keeps an empty history empty without fetching a nonexistent conversation", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetch);
    expect(await historyStore().listThreads()).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
