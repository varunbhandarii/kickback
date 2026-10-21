import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { hashPassword } from "better-auth/crypto";
import { setupDb, teardownDb } from "./helpers/db";
import { getDb } from "@/db";
import { getEnv } from "@/lib/env";
import { account, user } from "@/db/schema";
import { DEMO_SIGN_IN_HEADER, DEMO_VIEWER_EMAIL, demoSignInToken } from "@/lib/demo/accounts";
let auth: ReturnType<(typeof import("@/lib/auth"))["createMerchantAuth"]>;
const PASSWORD = "viewer-password-for-tests";
function request(path: string, body: object, extra: Record<string, string> = {}) {
  return new Request(`https://app.test/api/auth${path}`, {
    method: "POST",
    headers: { Origin: "https://app.test", "Content-Type": "application/json", "x-forwarded-for": "203.0.113.50", ...extra },
    body: JSON.stringify(body),
  });
}
const cookieOf = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
describe("the shared read-only demo account", () => {
  beforeAll(async () => {
    await setupDb();
    const { createMerchantAuth } = await import("@/lib/auth");
    auth = createMerchantAuth(getDb(), getEnv());
    const id = randomUUID();
    await getDb().insert(user).values({ id, name: "Demo visitor", email: DEMO_VIEWER_EMAIL, emailVerified: true });
    await getDb().insert(account).values({
      id: randomUUID(),
      accountId: id,
      userId: id,
      providerId: "credential",
      password: await hashPassword(PASSWORD),
      updatedAt: new Date(),
    });
  });
  afterAll(teardownDb);
  it("can't be signed in to from the public sign-in form, even with the right password", async () => {
    const r = await auth.handler(request("/sign-in/email", { email: DEMO_VIEWER_EMAIL, password: PASSWORD }));
    expect(r.status).toBe(403);
    const forged = await auth.handler(
      request("/sign-in/email", { email: DEMO_VIEWER_EMAIL, password: PASSWORD }, { [DEMO_SIGN_IN_HEADER]: "guess" }),
    );
    expect(forged.status).toBe(403);
  });
  it("signs in with the server's proof and then can't change or end the account", async () => {
    const proof = { [DEMO_SIGN_IN_HEADER]: demoSignInToken(getEnv().BETTER_AUTH_SECRET!) };
    const r = await auth.handler(request("/sign-in/email", { email: DEMO_VIEWER_EMAIL, password: PASSWORD }, proof));
    expect(r.status).toBe(200);
    const cookie = cookieOf(r);
    for (const [path, body] of [
      ["/change-password", { currentPassword: PASSWORD, newPassword: "another-password-123" }],
      ["/update-user", { name: "Mine now" }],
      ["/revoke-sessions", {}],
    ] as const) {
      const changed = await auth.handler(request(path, body, { Cookie: cookie }));
      expect(changed.status, path).toBe(403);
    }
  });
  it("reserves the demo emails for sign-up and password reset", async () => {
    expect((await auth.handler(request("/sign-up/email", { email: DEMO_VIEWER_EMAIL, password: "x".repeat(12), name: "X" }))).status).toBe(403);
    expect((await auth.handler(request("/request-password-reset", { email: DEMO_VIEWER_EMAIL, redirectTo: "/reset-password" }))).status).toBe(403);
  });
});
