import { vi, describe, it, expect, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  session: vi.fn(),
  member: vi.fn(),
  ip: "203.0.113.7",
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { signInEmail: mocks.signIn, getSession: mocks.session } } }));
vi.mock("@/lib/dal", () => ({ getSession: mocks.session, memberMerchant: mocks.member }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": mocks.ip, origin: "https://app.test" }),
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error("NEXT_REDIRECT " + to);
  },
}));
import { signIn } from "@/app/(account)/actions";
import { apiActor } from "@/lib/studio/api-actor";
import { resetRateLimits } from "@/lib/rate-limit";
import { DEMO_SIGN_IN_HEADER, demoSignInToken, viewerKey } from "@/lib/demo/accounts";
const env = {
  APP_URL: "https://app.test",
  KICKBACK_ENV: "sandbox",
  BETTER_AUTH_SECRET: "testing-auth-secret-".repeat(3),
  PAYPAL_CLIENT_ID: "client",
  PAYPAL_CLIENT_SECRET: "secret",
  KICKBACK_MASTER_KEY: Buffer.alloc(32, 1).toString("base64"),
  JOBS_BEARER: "x".repeat(32),
  DATABASE_URL: "postgres://test:test@localhost/test",
};
describe("sign-in limits per network", () => {
  beforeEach(() => {
    resetRateLimits();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    mocks.signIn.mockRejectedValue(new Error("bad password"));
  });
  it("stops a network after ten attempts in ten minutes, whatever the email", async () => {
    for (let i = 0; i < 10; i++) {
      const f = new FormData();
      f.set("email", `person${i}@example.com`);
      f.set("password", "wrong-password");
      expect((await signIn({}, f)).error).toMatch(/Invalid email or password/);
    }
    const f = new FormData();
    f.set("email", "another@example.com");
    f.set("password", "wrong-password");
    expect((await signIn({}, f)).error).toMatch(/Too many attempts from this network/);
    mocks.ip = "198.51.100.2";
    expect((await signIn({}, f)).error).toMatch(/Invalid email or password/);
  });
});
describe("API access for read-only visitors", () => {
  const merchant = { id: "8d4f2c1e-0000-4000-8000-000000000001", slug: "rosas", purgeAfter: null, status: "ACTIVE" };
  beforeEach(() => {
    resetRateLimits();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    mocks.session.mockResolvedValue({ user: { id: "viewer" }, session: { id: "s1" } });
    mocks.member.mockImplementation(async (_u: string, _id: string, roles: string[]) =>
      roles.includes("VIEWER") ? { merchant, role: "VIEWER" } : undefined,
    );
  });
  const request = () => new Request("https://app.test/api/x", { headers: { "x-forwarded-for": "203.0.113.9" } });
  it("keeps visitors out of routes that don't allow them", async () => {
    await expect(apiActor(request())).rejects.toMatchObject({ status: 403 });
  });
  it("lets visitors read, keyed by a hashed network instead of the raw address", async () => {
    const actor = await apiActor(request(), { allowViewer: true });
    expect(actor.role).toBe("VIEWER");
    expect(actor.viewerKey).toBe(viewerKey("203.0.113.9", env.BETTER_AUTH_SECRET));
    expect(actor.viewerKey).not.toContain("203.0.113.9");
  });
  it("limits each session per route per minute", async () => {
    for (let i = 0; i < 3; i++) await apiActor(request(), { allowViewer: true, perMinute: ["t", 3] });
    await expect(apiActor(request(), { allowViewer: true, perMinute: ["t", 3] })).rejects.toMatchObject({ status: 429 });
  });
  it("signs the demo sign-in proof with the server secret", () => {
    expect(DEMO_SIGN_IN_HEADER).toMatch(/^x-/);
    expect(demoSignInToken("a".repeat(40))).not.toBe(demoSignInToken("b".repeat(40)));
  });
});
