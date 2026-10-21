import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getDb } from "@/db";
import { soakRuns } from "@/db/schema";
import { fixture, resetDb, setupDb, teardownDb } from "./helpers/db";
const m = vi.hoisted(() => ({
  start: vi.fn(),
  execute: vi.fn(),
  view: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@/lib/demo/runs", () => ({ startDemoRun: m.start, executeDemoRun: m.execute, runView: m.view }));
vi.mock("@/lib/status", () => ({ serviceStatus: m.status }));
import { runSoak, soakDue } from "@/lib/demo/soak";
import { lastBeat } from "@/lib/heartbeat";
describe("daily end-to-end check", () => {
  beforeAll(setupDb);
  afterAll(teardownDb);
  beforeEach(async () => {
    await resetDb();
    await getDb().delete(soakRuns);
    await fixture();
    vi.stubEnv("AI_ENABLED", "false");
    m.status.mockResolvedValue({ overall: "ok", rows: [] });
    m.start.mockResolvedValue({ ok: true, id: "run-1" });
    m.execute.mockResolvedValue(undefined);
    m.view.mockResolvedValue({ state: "confirmed" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<h1>Try Kickback</h1>"));
  });
  it("runs once a day after 15:00 UTC", async () => {
    expect(await soakDue(new Date("2026-11-20T14:59:00Z"))).toBe(false);
    expect(await soakDue(new Date("2026-11-20T15:01:00Z"))).toBe(true);
    await getDb().insert(soakRuns).values({ startedAt: new Date("2026-11-20T15:02:00Z") });
    expect(await soakDue(new Date("2026-11-20T18:00:00Z"))).toBe(false);
  });
  it("records each step and beats only when everything passed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ok = await runSoak();
    expect(ok.ok).toBe(true);
    expect(ok.steps.map((s) => s.name)).toEqual(["status", "watch-run", "metrics", "analyst", "demo-page"]);
    expect(ok.steps.find((s) => s.name === "analyst")?.detail).toMatch(/skipped/);
    expect(await lastBeat("soak")).toBeInstanceOf(Date);
    m.view.mockResolvedValue({ state: "failed", error: "Guard held this reward" });
    const bad = await runSoak();
    expect(bad.ok).toBe(false);
    const rows = await getDb().select().from(soakRuns);
    expect(rows.find((r) => !r.ok)?.failure).toMatch(/watch-run: Guard held/);
  });
});
