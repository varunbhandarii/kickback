import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants, merchantUsers, user } from "@/db/schema";
import { fixture, resetDb, setupDb, teardownDb } from "./helpers/db";
import { DEMO_VIEWER_EMAIL } from "@/lib/demo/accounts";
const current = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string }; session: { id: string; createdAt: Date } },
}));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: new Proxy(
      {},
      {
        get: (_, name) =>
          name === "getSession"
            ? async () => current.session
            : async () => {
                throw new Error("Auth API is not available in this test");
              },
      },
    ),
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined, has: () => false }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error("NEXT_REDIRECT " + to);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/server", () => ({ after: () => undefined }));

// Every server action a signed-in visitor could post to. Public sign-in and demo actions are excluded.
const modules = import.meta.glob<Record<string, unknown>>([
  "../src/app/m/**/actions.ts",
  "../src/app/m/**/*-actions.ts",
  "../src/app/invite/actions.ts",
]);
const VIEWER = "viewer-user",
  OWNER = "owner-user";
async function snapshot() {
  const tables = await getDb().execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema = 'public' and table_name not in ('session', 'verification')`,
  );
  const out: Record<string, string[]> = {};
  for (const { table_name } of (tables as unknown as { rows: { table_name: string }[] }).rows) {
    const rows = await getDb().execute(sql.raw(`select * from "${table_name}"`));
    out[table_name] = (rows as unknown as { rows: unknown[] }).rows.map((r) => JSON.stringify(r)).sort();
  }
  return out;
}
function form(merchantId: string) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    merchantId,
    merchant: merchantId,
    paused: "yes",
    confirm: "DISCONNECT",
    confirmAccess: "on",
    id: "00000000-0000-0000-0000-000000000000",
    rewardId: "00000000-0000-0000-0000-000000000000",
    customer: "KEY",
    excluded: "yes",
    displayName: "Changed",
    slug: "changed",
    tz: "UTC",
    category: "cafe",
    email: "someone@example.com",
    owner: OWNER,
    decision: "approve",
    voice: "warm",
    goal: "Bring back regulars",
  }))
    f.set(k, v);
  return f;
}
async function call(fn: (...args: unknown[]) => unknown, merchantId: string) {
  try {
    return { result: await (fn.length >= 2 ? fn({}, form(merchantId)) : fn(form(merchantId))) };
  } catch (e) {
    return { threw: e instanceof Error ? e.message : String(e) };
  }
}
describe("read-only demo visitors", () => {
  let merchantId = "";
  beforeAll(setupDb);
  afterAll(teardownDb);
  beforeEach(async () => {
    await resetDb();
    await getDb().delete(user);
    const merchant = await fixture();
    merchantId = merchant.id;
    await getDb().insert(user).values([
      { id: VIEWER, name: "Demo visitor", email: DEMO_VIEWER_EMAIL, emailVerified: true },
      { id: OWNER, name: "Owner", email: "owner@example.com", emailVerified: true },
    ]);
    await getDb().insert(merchantUsers).values([
      { userId: VIEWER, merchantId, role: "VIEWER" },
      { userId: OWNER, merchantId, role: "OWNER" },
    ]);
    current.session = { user: { id: VIEWER, email: DEMO_VIEWER_EMAIL }, session: { id: "s-viewer", createdAt: new Date() } };
  });
  it("finds every action module", () => {
    expect(Object.keys(modules).length).toBeGreaterThanOrEqual(10);
  });
  for (const path of Object.keys(modules))
    it(`cannot change anything through ${path.replace("../src/app/", "")}`, async () => {
      const mod = await modules[path]();
      const actions = Object.entries(mod).filter(([, v]) => typeof v === "function") as [string, (...a: unknown[]) => unknown][];
      expect(actions.length).toBeGreaterThan(0);
      for (const [name, fn] of actions) {
        const before = await snapshot();
        const outcome = await call(fn, merchantId);
        expect(await snapshot(), `${name} changed the database`).toEqual(before);
        expect(outcome, name).toBeDefined();
        // Refused for access, sent back to the app, an explained error, or a silent no-op.
        const refused =
          ("threw" in outcome && /Business access denied|NEXT_REDIRECT/.test(outcome.threw ?? "")) ||
          ("result" in outcome && (outcome.result === undefined || Boolean((outcome.result as { error?: string }).error)));
        expect(refused, `${name}: ${JSON.stringify(outcome)}`).toBe(true);
      }
    });
  it("cannot delete the shared account even with the confirmation typed", async () => {
    const { deleteAccount } = await import("@/app/m/settings/team-actions");
    const f = new FormData();
    f.set("confirm", "DELETE MY ACCOUNT");
    const before = await snapshot();
    const result = await deleteAccount({}, f);
    expect(result.error).toBeTruthy();
    expect(await snapshot()).toEqual(before);
  });
  it("the snapshot notices a real change (owner control)", async () => {
    current.session = { user: { id: OWNER, email: "owner@example.com" }, session: { id: "s-owner", createdAt: new Date() } };
    const { toggleRewards } = await import("@/app/m/actions");
    const before = await snapshot();
    await call(toggleRewards as (...a: unknown[]) => unknown, merchantId);
    expect(await snapshot()).not.toEqual(before);
    const [row] = await getDb().select().from(merchants).where(eq(merchants.id, merchantId));
    expect(row.rewardsPaused).toBe(true);
  });
  it("expires a visitor session after a day", async () => {
    const { enforceSessionAge } = await import("@/lib/session-policy");
    const old = { user: { email: DEMO_VIEWER_EMAIL }, session: { id: "x", createdAt: new Date(Date.now() - 25 * 3600000) } };
    expect(await enforceSessionAge(old)).toBeNull();
    const owner = { user: { email: "owner@example.com" }, session: { id: "y", createdAt: new Date(Date.now() - 25 * 3600000) } };
    expect(await enforceSessionAge(owner)).toBe(owner);
  });
});
