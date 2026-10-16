import { vi, it, expect, beforeAll, afterAll } from "vitest";
const mocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("@renderinc/sdk", () => ({
  Render: class {
    workflows = { startTask: mocks.start };
  },
}));
import { nightlyKey, triggerReconcile } from "@/lib/workflow-trigger";
import { setupDb, teardownDb } from "./helpers/db";
beforeAll(setupDb);
afterAll(teardownDb);
it("uses one UTC idempotency key for the whole day", () => {
  expect(nightlyKey(new Date("2026-10-15T00:00Z"))).toBe(
    nightlyKey(new Date("2026-10-15T23:59Z")),
  );
});
it("skips when workflow credentials are absent", async () => {
  vi.stubEnv("RENDER_API_KEY", "");
  vi.stubEnv("WORKFLOW_SLUG", "");
  expect(await triggerReconcile()).toEqual({ skipped: true });
  expect(mocks.start).not.toHaveBeenCalled();
});
it("starts the configured task with a daily idempotency key", async () => {
  vi.stubEnv("RENDER_API_KEY", "test-key");
  vi.stubEnv("WORKFLOW_SLUG", "kickback-workflows");
  mocks.start.mockResolvedValue({ taskRunId: "run-safe" });
  expect(await triggerReconcile(new Date("2026-10-15"))).toEqual({
    taskRunId: "run-safe",
  });
  expect(mocks.start).toHaveBeenCalledWith(
    "kickback-workflows/nightlyReconcile",
    [],
    expect.objectContaining({ idempotencyKey: "nightly-2026-10-15" }),
  );
});
