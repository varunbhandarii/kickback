import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  owned: vi.fn(),
  cookie: vi.fn(),
}));
vi.mock("@/lib/dal", () => ({
  getSession: mocks.session,
  ownedMerchant: mocks.owned,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookie }),
}));
import { apiActor, readJson } from "@/lib/studio/api-actor";
import { setupDb, teardownDb } from "./helpers/db";
describe("Studio API authentication", () => {
  beforeAll(setupDb);
  afterAll(teardownDb);
  it.each(["cross-site", "same-site"])(
    "rejects %s before session access",
    async (site) => {
      await expect(
        apiActor(
          new Request("https://app.test", {
            headers: { "sec-fetch-site": site },
          }),
        ),
      ).rejects.toMatchObject({ status: 403 });
    },
  );
  it("requires a session and the selected owned business", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(
      apiActor(new Request("https://app.test")),
    ).rejects.toMatchObject({ status: 401 });
    mocks.session.mockResolvedValue({ user: { id: "owner" } });
    mocks.cookie.mockReturnValue({ value: "foreign" });
    mocks.owned.mockResolvedValue(undefined);
    await expect(
      apiActor(new Request("https://app.test")),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.owned).toHaveBeenLastCalledWith("owner", "foreign");
  });
  it("rejects origin mismatches", async () => {
    await expect(
      apiActor(
        new Request("https://app.test", {
          headers: { origin: "https://evil.test" },
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("bounds actual bytes when content-length is absent", async () => {
    await expect(
      readJson(
        new Request("https://app.test", {
          method: "POST",
          body: '{"text":"' + "x".repeat(300) + '"}',
        }),
        100,
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});
