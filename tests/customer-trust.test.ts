import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  setupDb,
  resetDb,
  teardownDb,
  fixture,
  purchase,
  milestone,
} from "./helpers/db";
import {
  signProgressToken,
  verifyProgressToken,
} from "@/lib/crypto/progress-token";
import { readProgress } from "@/lib/payments/progress";
import { resetRateLimits } from "@/lib/rate-limit";
import { customerKey } from "@/lib/crypto/tenant";
import { getDb } from "@/db";
import { merchants, rewards } from "@/db/schema";
import { csvCell, rewardsCsv } from "@/lib/rewards/csv";
import { programSentence } from "@/lib/payments/program-sentence";
import { defaultProgram } from "@/lib/engine/program";
import { copyValid, validateScribeSpec, templateNotes } from "@/lib/ai/scribe";
import { securityHeaders } from "@/lib/security-headers";
beforeAll(setupDb);
beforeEach(async () => {
  await resetDb();
  resetRateLimits();
});
afterAll(teardownDb);
const time = Date.parse("2026-10-15T12:00:00Z"),
  mid = randomUUID(),
  key = "A1234567890";
it("validates a scoped signed progress link", () =>
  expect(verifyProgressToken(signProgressToken(mid, key, time), time)).toEqual({
    m: mid,
    c: key,
    iat: time / 1000,
  }));
it("rejects a changed payload", () => {
  const t = signProgressToken(mid, key, time);
  expect(verifyProgressToken(t.replace(t[0], "x"), time)).toBeNull();
});
it("rejects a changed signature", () => {
  const t = signProgressToken(mid, key, time);
  expect(
    verifyProgressToken(t.slice(0, -1) + (t.endsWith("x") ? "y" : "x"), time),
  ).toBeNull();
});
it("expires at exactly 365 days", () =>
  expect(
    verifyProgressToken(
      signProgressToken(mid, key, time),
      time + 365 * 86400000,
    ),
  ).toBeNull());
it("rejects a future issue date", () =>
  expect(
    verifyProgressToken(signProgressToken(mid, key, time + 10000), time),
  ).toBeNull());
it.each(["", "x.y.z", "x".repeat(513)])("rejects malformed token %s", (t) =>
  expect(verifyProgressToken(t, time)).toBeNull(),
);
it("returns only summary progress and excludes unsent rewards", async () => {
  const m = await fixture();
  await purchase(m);
  const d = await readProgress(
    m.slug,
    signProgressToken(m.id, customerKey(m.id, "PRIVATE_BUYER_ID")),
    "one",
  );
  expect(d).toMatchObject({
    name: "Rosa's Cafe",
    progress: { current: 1 },
    paid: { count: 0, cents: 0 },
  });
  expect(JSON.stringify(d)).not.toMatch(/PRIVATE_BUYER|customerKey|wallet|@/);
});
it("rejects a valid token on a different merchant slug", async () => {
  const m = await fixture();
  await fixture(undefined, "salon");
  expect(
    await readProgress("salon", signProgressToken(m.id, key), "two"),
  ).toHaveProperty("error", "This link is invalid or has expired.");
});
it.each(["purged", "disconnected"])("ends %s links", async (mode) => {
  const m = await fixture();
  await getDb()
    .update(merchants)
    .set(
      mode === "purged"
        ? { purgeAfter: new Date() }
        : { status: "DISCONNECTED" },
    )
    .where(eq(merchants.id, m.id));
  expect(
    await readProgress(m.slug, signProgressToken(m.id, key), mode),
  ).toHaveProperty("error", "This program has ended.");
});
it("limits repeated reads per token", async () => {
  const token = signProgressToken(mid, key);
  for (let i = 0; i < 30; i++) await readProgress("missing", token, String(i));
  expect(await readProgress("missing", token, "last")).toHaveProperty(
    "error",
    "Please try again shortly.",
  );
});
it.each([
  ["hello,world", '"hello,world"'],
  ['a"b', '"a""b"'],
  ["=1+1", "'=1+1"],
  ["@SUM(1)", "'@SUM(1)"],
  ["  =1+1", "'  =1+1"],
  ["\tplain", "'\tplain"],
  ["\nplain", '"\'\nplain"'],
  [null, ""],
])("escapes CSV cell %s", (input, expected) =>
  expect(csvCell(input)).toBe(expected),
);
it("streams one tenant's annual rewards without hidden keys", async () => {
  const a = await fixture(),
    b = await fixture(undefined, "salon");
  const { reward } = await milestone(a);
  await milestone(b);
  await getDb()
    .update(rewards)
    .set({ reason: 'say "hello", again' })
    .where(eq(rewards.id, reward.id));
  const csv = await new Response(
    rewardsCsv(a, new Date().getUTCFullYear()),
  ).text();
  expect(csv.trim().split("\r\n")).toHaveLength(2);
  expect(csv).toContain(reward.id);
  expect(csv).toContain('"say ""hello"", again"');
  expect(csv).not.toContain(customerKey(a.id, "PRIVATE_BUYER_ID"));
});
it.each([2019, 3000, 2025.5])("rejects unsupported tax year %s", (year) =>
  expect(() => rewardsCsv({ id: mid, tz: "UTC" }, year)).toThrow(),
);
it.each([
  defaultProgram,
  { ...defaultProgram, type: "SPEND_MILESTONE" as const, spendCents: 4000 },
])("builds bounded factual receipt copy", (s) => {
  const text = programSentence(s, "Rosa's Cafe");
  expect(text.length).toBeLessThanOrEqual(250);
  expect(text).toMatch(/loyalty reward/);
  expect(text).not.toMatch(
    /discount|coupon|guarantee|instantly|\bsale\b|\boffer\b/i,
  );
});
it("requires loyalty reward in newly activated notes", () => {
  expect(
    copyValid(
      "Rosa's Cafe thanks you for 5 visits",
      120,
      "Rosa's Cafe",
      defaultProgram,
      { notes: true },
    ),
  ).toBe(false);
  expect(() =>
    validateScribeSpec(
      {
        ...defaultProgram,
        noteVariants: templateNotes("Rosa's Cafe", defaultProgram),
      },
      "Rosa's Cafe",
    ),
  ).not.toThrow();
  expect(() =>
    validateScribeSpec(
      { ...defaultProgram, welcomeBackNote: "Rosa's Cafe welcomes you" },
      "Rosa's Cafe",
    ),
  ).toThrow();
});
it("sets protective headers and report-only CSP without enforcing it", () => {
  const h = Object.fromEntries(securityHeaders().map((h) => [h.key, h.value]));
  expect(Object.keys(h)).toHaveLength(7);
  expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
  expect(h["Strict-Transport-Security"]).not.toContain("preload");
  expect(h["Content-Security-Policy-Report-Only"]).toContain(
    "https://*.venmo.com",
  );
  expect(h["Content-Security-Policy"]).toBeUndefined();
});
it("adds Sentry reporting only when configured", () => {
  const url =
    "https://o1.ingest.us.sentry.io/api/1/security/?sentry_key=public";
  const h = securityHeaders(url);
  expect(h.find((h) => h.key === "Reporting-Endpoints")?.value).toContain(
    "/api/security/csp",
  );
  expect(() => securityHeaders("https://evil.test/csp")).toThrow();
});
