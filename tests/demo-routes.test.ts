import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getDb } from "@/db";
import { demoBuyers } from "@/db/schema";
import { fixture, resetDb, setupDb, teardownDb } from "./helpers/db";
import { GET as listBuyers, POST as saveBuyer } from "@/app/api/admin/demo-buyers/route";
import { POST as buyerAction } from "@/app/api/admin/demo-buyers/[slot]/[action]/route";
import { POST as demoAction } from "@/app/api/admin/demo/[action]/route";
import { GET as runRoute } from "@/app/api/demo/runs/[id]/route";
import { GET as statusRoute } from "@/app/api/status/route";
import { demoPathsOff } from "@/lib/demo/runs";
import { resetRateLimits } from "@/lib/rate-limit";
const bearer = { authorization: "Bearer " + "x".repeat(32) };
const req = (path: string, init: RequestInit = {}) => new Request("https://app.test" + path, init);
describe("demo admin and public routes", () => {
  beforeAll(setupDb);
  afterAll(teardownDb);
  beforeEach(async () => {
    await resetDb();
    await getDb().delete(demoBuyers);
    resetRateLimits();
    await fixture();
  });
  it("needs the operator bearer and sandbox demo mode", async () => {
    expect((await listBuyers(req("/api/admin/demo-buyers"))).status).toBe(401);
    expect((await demoAction(req("/api/admin/demo/pause", { method: "POST" }), { params: Promise.resolve({ action: "pause" }) })).status).toBe(401);
    vi.stubEnv("DEMO_MODE", "false");
    expect((await listBuyers(req("/api/admin/demo-buyers", { headers: bearer }))).status).toBe(404);
    vi.stubEnv("DEMO_MODE", "true");
  });
  it("registers buyers without ever returning their wallets", async () => {
    const saved = await saveBuyer(
      req("/api/admin/demo-buyers", {
        method: "POST",
        headers: bearer,
        body: JSON.stringify({ slot: 2, email: "KB-Demo-2@Example.com", purpose: "pay" }),
      }),
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ slot: 2, email: "kb-demo-2@example.com", hasWallet: false, status: "cooling" });
    const list = await (await listBuyers(req("/api/admin/demo-buyers", { headers: bearer }))).json();
    expect(list.buyers).toHaveLength(1);
    expect(JSON.stringify(list)).not.toMatch(/vault|customerKey/i);
    const setup = await buyerAction(req("/x", { method: "POST", headers: bearer }), { params: Promise.resolve({ slot: "9", action: "setup" }) });
    expect(setup.status).toBe(409);
    expect((await buyerAction(req("/x", { method: "POST", headers: bearer }), { params: Promise.resolve({ slot: "2", action: "nope" }) })).status).toBe(404);
  });
  it("pauses and resumes the demo payment paths without a deploy", async () => {
    const off = await demoAction(req("/x", { method: "POST", headers: bearer }), { params: Promise.resolve({ action: "pause" }) });
    expect(await off.json()).toEqual({ demoPathsOff: true });
    expect(await demoPathsOff()).toBe(true);
    await demoAction(req("/x", { method: "POST", headers: bearer }), { params: Promise.resolve({ action: "resume" }) });
    expect(await demoPathsOff()).toBe(false);
  });
  it("serves run progress only for real run ids", async () => {
    expect((await runRoute(req("/api/demo/runs/x"), { params: Promise.resolve({ id: "not-a-uuid" }) })).status).toBe(404);
    expect(
      (await runRoute(req("/api/demo/runs/x"), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) })).status,
    ).toBe(404);
  });
  it("answers the uptime monitor with flat component health", async () => {
    const r = await statusRoute(req("/api/status"));
    const body = await r.json();
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(body.database).toBe("ok");
    expect(body.overall).toMatch(/ok|warn/);
  });
});
