import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto/tenant";
describe("merchant-bound credentials", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("rejects moving encrypted credentials to another merchant", () => {
    for (const [key, value] of Object.entries({
      DATABASE_URL: "postgres://test@localhost/test",
      PAYPAL_CLIENT_ID: "client",
      PAYPAL_CLIENT_SECRET: "secret",
      JOBS_BEARER: "j".repeat(32),
      KICKBACK_MASTER_KEY: Buffer.alloc(32, 2).toString("base64"),
    }))
      vi.stubEnv(key, value);
    const sealed = encryptSecret("private-merchant-secret", "merchant-a");
    expect(sealed.includes(Buffer.from("private-merchant-secret"))).toBe(false);
    expect(decryptSecret(sealed, "merchant-a")).toBe("private-merchant-secret");
    expect(() => decryptSecret(sealed, "merchant-b")).toThrow();
    expect(() => decryptSecret(sealed)).toThrow();
  });
});
