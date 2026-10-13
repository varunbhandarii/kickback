import { beforeEach, describe, expect, it } from "vitest";
import {
  emailAttemptAllowed,
  MAX_SESSION_AGE_MS,
  resetEmailBucketsForTests,
  sessionTooOld,
} from "@/lib/auth-policy";
describe("sign-in abuse policy", () => {
  beforeEach(resetEmailBucketsForTests);
  it("blocks a sixth attempt across case/whitespace variants and recovers after expiry", () => {
    for (let n = 0; n < 5; n++)
      expect(
        emailAttemptAllowed(
          n % 2 ? " OWNER@example.com " : "owner@example.com",
          "test-secret",
          1000,
        ),
      ).toBe(true);
    expect(emailAttemptAllowed("owner@example.com", "test-secret", 1000)).toBe(
      false,
    );
    expect(emailAttemptAllowed("other@example.com", "test-secret", 1000)).toBe(
      true,
    );
    expect(
      emailAttemptAllowed(
        "owner@example.com",
        "test-secret",
        1000 + 15 * 60000,
      ),
    ).toBe(true);
  });
  it("limits absolute session age independently of sliding expiry", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    expect(
      sessionTooOld(created, created.getTime() + MAX_SESSION_AGE_MS - 1),
    ).toBe(false);
    expect(sessionTooOld(created, created.getTime() + MAX_SESSION_AGE_MS)).toBe(
      true,
    );
  });
});
