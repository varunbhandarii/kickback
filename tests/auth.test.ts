import { randomUUID } from "node:crypto";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { setupDb, teardownDb } from "./helpers/db";
import { getDb } from "@/db";
import { getEnv } from "@/lib/env";
import { resetEmailBucketsForTests } from "@/lib/auth-policy";
import { enforceSessionAge } from "@/lib/session-policy";
import { session as sessions, user } from "@/db/schema";
import { eq } from "drizzle-orm";
let auth: ReturnType<(typeof import("@/lib/auth"))["createMerchantAuth"]>;
function request(
  path: string,
  body?: object,
  cookie = "",
  ip = "203.0.113.10",
) {
  return new Request(`https://app.test/api/auth${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: "https://app.test",
      "Content-Type": "application/json",
      Cookie: cookie,
      "x-forwarded-for": ip,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
describe("merchant authentication", () => {
  beforeAll(async () => {
    await setupDb();
    const { createMerchantAuth } = await import("@/lib/auth");
    auth = createMerchantAuth(getDb(), getEnv());
  });
  afterAll(teardownDb);
  beforeEach(resetEmailBucketsForTests);
  it("starts sandbox PayPal login with identity scopes and a protected callback state", async () => {
    const { createMerchantAuth } = await import("@/lib/auth");
    const paypal = createMerchantAuth(getDb(), {
      ...getEnv(),
      PAYPAL_LOGIN_ENABLED: true,
    });
    const response = await paypal.handler(
      request("/sign-in/social", { provider: "paypal", callbackURL: "/m" }),
    );
    expect(response.status).toBe(200);
    const url = new URL((await response.json()).url);
    expect(url.origin).toBe("https://www.sandbox.paypal.com");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.test/api/auth/callback/paypal",
    );
    expect(url.searchParams.get("state")).toBeTruthy();
  });
  it("creates a merchant account and DB session, signs out, and signs in again", async () => {
    const email = `${randomUUID()}@example.com`,
      password = "A-long-test-password";
    const signup = await auth.handler(
      request("/sign-up/email", { name: "Test merchant", email, password }),
    );
    expect(signup.status).toBe(200);
    const cookie = signup.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    expect(Boolean(cookie)).toBe(true);
    const signedIn = await auth.handler(
      request("/get-session", undefined, cookie),
    );
    expect((await signedIn.json()).user.email).toBe(email);
    const signout = await auth.handler(request("/sign-out", {}, cookie));
    expect(signout.status).toBe(200);
    const loggedOut = await auth.handler(
      request("/get-session", undefined, cookie),
    );
    expect(await loggedOut.json()).toBeNull();
    const login = await auth.handler(
      request("/sign-in/email", { email, password }),
    );
    expect(login.status).toBe(200);
  });
  it("blocks the sixth failed email attempt even across request IPs", async () => {
    const email = `${randomUUID()}@example.com`;
    for (let n = 0; n < 5; n++) {
      const response = await auth.handler(
        request(
          "/sign-in/email",
          { email, password: "wrong-test-password" },
          "",
          `203.0.113.${30 + n}`,
        ),
      );
      expect(response.status).toBe(401);
    }
    const blocked = await auth.handler(
      request(
        "/sign-in/email",
        { email, password: "wrong-test-password" },
        "",
        "203.0.113.99",
      ),
    );
    expect(blocked.status).toBe(429);
  });
  it("rejects sign-up from an untrusted origin", async () => {
    const response = await auth.handler(
      new Request("https://app.test/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          Origin: "https://other.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Bad origin",
          email: `${randomUUID()}@example.com`,
          password: "long-test-password",
        }),
      }),
    );
    expect(response.status).toBe(403);
  });
  it("deletes an absolutely expired session even when its sliding expiry is still valid", async () => {
    const signup = await auth.handler(
      request("/sign-up/email", {
        name: "Aged session",
        email: `${randomUUID()}@example.com`,
        password: "A-long-test-password",
      }),
    );
    const cookie = signup.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; "),
      result = await (
        await auth.handler(request("/get-session", undefined, cookie))
      ).json();
    const old = new Date(Date.now() - 31 * 86400000);
    await getDb()
      .update(sessions)
      .set({ createdAt: old, expiresAt: new Date(Date.now() + 86400000) })
      .where(eq(sessions.id, result.session.id));
    expect(
      await enforceSessionAge({
        ...result,
        session: { ...result.session, createdAt: old },
      }),
    ).toBeNull();
    expect(
      await getDb()
        .select()
        .from(sessions)
        .where(eq(sessions.id, result.session.id)),
    ).toHaveLength(0);
  });
  it("verifies email, consumes a magic link once, and revokes sessions after password reset", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-resend-key");
    vi.stubEnv("EMAIL_FROM", "accounts@merchant.test");
    const messages: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      messages.push(JSON.parse(String(init.body)).text);
      return Response.json({ id: "mock-email" });
    });
    try {
      const { createMerchantAuth } = await import("@/lib/auth"),
        emailAuth = createMerchantAuth(getDb(), getEnv()),
        email = `${randomUUID()}@example.com`;
      const signup = await emailAuth.handler(
        request("/sign-up/email", {
          name: "Email owner",
          email,
          password: "A-long-test-password",
        }),
      );
      expect(signup.status).toBe(200);
      const originalCookie = signup.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const verificationUrl = messages.at(-1)!.match(/https:\/\/\S+/)![0];
      await emailAuth.handler(
        new Request(verificationUrl, {
          headers: { Origin: "https://app.test" },
        }),
      );
      expect(
        (await getDb().select().from(user).where(eq(user.email, email)))[0]
          .emailVerified,
      ).toBe(true);
      const link = await emailAuth.handler(
        request("/sign-in/magic-link", { email, callbackURL: "/m" }),
      );
      expect(link.status).toBe(200);
      const magicUrl = messages.at(-1)!.match(/https:\/\/\S+/)![0],
        approved = await emailAuth.handler(
          new Request(magicUrl, { headers: { Origin: "https://app.test" } }),
        );
      expect(approved.headers.getSetCookie().length).toBeGreaterThan(0);
      const countBefore = (await getDb().select().from(sessions)).length;
      await emailAuth.handler(
        new Request(magicUrl, { headers: { Origin: "https://app.test" } }),
      );
      expect(await getDb().select().from(sessions)).toHaveLength(countBefore);
      expect(
        (
          await emailAuth.handler(
            request("/request-password-reset", {
              email,
              redirectTo: "/reset-password",
            }),
          )
        ).status,
      ).toBe(200);
      const resetUrl = new URL(messages.at(-1)!.match(/https:\/\/\S+/)![0]),
        token = resetUrl.pathname.split("/").at(-1)!;
      expect(
        (
          await emailAuth.handler(
            request("/reset-password", {
              token,
              newPassword: "A-new-test-password",
            }),
          )
        ).status,
      ).toBe(200);
      expect(
        await (
          await emailAuth.handler(
            request("/get-session", undefined, originalCookie),
          )
        ).json(),
      ).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      vi.stubEnv("RESEND_API_KEY", "");
      vi.stubEnv("EMAIL_FROM", "");
    }
  });
});
