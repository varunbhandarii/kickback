import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
vi.mock("@/lib/dal", () => ({ getSession: vi.fn(), ownedMerchant: vi.fn() }));
import { and, eq, sql } from "drizzle-orm";
import { setupDb, resetDb, teardownDb, fixture, purchase } from "./helpers/db";
import { getDb } from "@/db";
import { aiCalls, visits, programs } from "@/db/schema";
import { cohortQuery } from "@/lib/studio/cohorts";
import { querySchema } from "@/lib/studio/query";
import { studioQuery } from "@/lib/studio/server-data";
import { saveTelemetry, telemetrySchema } from "@/lib/studio/telemetry-server";
import { purgeOperationalMetadata } from "@/lib/db/purge-tenants";
import { saveThread, loadThread } from "@/lib/studio/threads";
import { sanitizeCspReport } from "@/lib/csp-report";
beforeAll(setupDb);
beforeEach(resetDb);
afterAll(teardownDb);
const cohortBody = querySchema.parse({
  table: "cohorts",
  fields: [
    "cohorts.cohort_month",
    "cohorts.customers",
    "cohorts.returned_30",
    "cohorts.returned_60",
    "cohorts.rate_60",
    "cohorts.period",
    "cohorts.includes_demo",
  ],
});
it("uses local month boundaries, labels before/after and excludes fixtures", async () => {
  const m = await fixture(),
    foreign = await fixture(undefined, "salon"),
    now = new Date("2026-10-15T12:00Z");
  await getDb()
    .update(programs)
    .set({ effectiveFrom: new Date("2026-09-10T12:00Z") })
    .where(eq(programs.merchantId, m.id));
  await purchase(m, { at: new Date("2026-09-01T02:00Z"), account: "a" }); // Still August in New York.
  await purchase(m, { at: new Date("2026-09-25T12:00Z"), account: "a" });
  await purchase(m, { at: new Date("2026-09-10T12:00Z"), account: "b" });
  await purchase(foreign, {
    at: new Date("2026-09-10T12:00Z"),
    account: "outside",
  });
  await purchase(m, { at: new Date("2026-09-12T12:00Z"), account: "fixture" });
  await getDb()
    .update(visits)
    .set({ source: "FIXTURE" })
    .where(
      and(
        eq(visits.merchantId, m.id),
        eq(visits.startedAt, new Date("2026-09-12T12:00Z")),
      ),
    );
  await getDb()
    .update(visits)
    .set({ source: "REPLAY" })
    .where(
      and(
        eq(visits.merchantId, m.id),
        eq(visits.startedAt, new Date("2026-09-25T12:00Z")),
      ),
    );
  const { data } = await cohortQuery(m, m.spec.minTicketCents, cohortBody, now);
  expect(data).toHaveLength(12);
  expect(data.find((r) => r.cohort_month === "2026-08")).toMatchObject({
    customers: 1,
    returned_30: 1,
    returned_60: 1,
    period: "before",
    includes_demo: true,
  });
  expect(data.find((r) => r.cohort_month === "2026-09")).toMatchObject({
    customers: 1,
    returned_60: 0,
    period: "after",
  });
  expect(data.find((r) => r.cohort_month === "2026-07")).toMatchObject({
    customers: 0,
    rate_60: null,
  });
});
it.each(["visits", "customers", "rewards"] as const)(
  "supports text filters on %s enums",
  async (table) => {
    const m = await fixture();
    await purchase(m);
    const field = table === "rewards" ? "state" : "status";
    await expect(
      studioQuery(
        m,
        querySchema.parse({
          table,
          fields: [`${table}.${field}`],
          options: {
            filter: {
              field: `${table}.${field}`,
              operator: "contains",
              value: table === "visits" ? "COMP" : "O",
            },
          },
        }),
      ),
    ).resolves.toHaveProperty("data");
  },
);
it("upserts count telemetry per merchant and removes expired records", async () => {
  const a = await fixture(),
    b = await fixture(undefined, "salon"),
    now = Date.now();
  const rows = telemetrySchema.parse([
    {
      threadId: "thread",
      runId: "same",
      agentId: "analyst",
      startedAt: now - 1000,
      finishedAt: now,
      status: "ok",
      turns: 1,
      toolCalls: 2,
      toolErrors: 0,
    },
  ]);
  await saveTelemetry(a.id, rows);
  await saveTelemetry(a.id, rows);
  await saveTelemetry(b.id, rows);
  const result = await getDb().execute(
    sql`select merchant_id,run_id from ai_usage`,
  );
  expect((result as unknown as { rows: unknown[] }).rows).toHaveLength(2);
  await getDb().execute(
    sql`update ai_usage set started_at=now()-interval '91 days',finished_at=now()-interval '91 days' where merchant_id=${a.id}`,
  );
  await purgeOperationalMetadata();
  const left = (
    (await getDb().execute(
      sql`select merchant_id from ai_usage`,
    )) as unknown as { rows: unknown[] }
  ).rows;
  expect(left).toEqual([{ merchant_id: b.id }]);
});
it("cannot overwrite another tenant's thread", async () => {
  const a = await fixture(),
    b = await fixture(undefined, "salon"),
    body = {
      summary: {
        threadId: "shared",
        agentId: "analyst",
        updatedAt: Date.now(),
      },
      messages: [],
    };
  await saveThread(a.id, "shared", body);
  await expect(saveThread(b.id, "shared", body)).rejects.toMatchObject({
    status: 403,
  });
  expect(await loadThread(b.id, "shared")).toBeUndefined();
  expect(await loadThread(a.id, "shared")).toBeDefined();
});
it("strips progress tokens, OAuth query values and snippets from CSP reports", () => {
  const report = sanitizeCspReport({
    "csp-report": {
      "document-uri": "https://app.test/pay/rosas/progress?t=SECRET",
      "blocked-uri": "https://api.test/foo?token=SECRET",
      "source-file": "https://app.test/auth?code=SECRET",
      "effective-directive": "script-src",
      "script-sample": "PRIVATE TEXT",
    },
  });
  expect(JSON.stringify(report)).not.toMatch(/SECRET|PRIVATE/);
  expect(report).not.toBeNull();
});
it("returns zero-filled Analyst usage days", async () => {
  const m = await fixture();
  const result = await studioQuery(
    m,
    querySchema.parse({
      table: "ai_usage",
      fields: ["ai_usage.day", "ai_usage.runs", "ai_usage.cost_cents"],
    }),
  );
  expect(result.data).toHaveLength(30);
  // Read-only demo visitors' turns count toward neither runs nor cost.
  await getDb().insert(aiCalls).values([
    { merchantId: m.id, feature: "analyst", model: "m", inputTokens: 1000000, actorKind: "owner" },
    { merchantId: m.id, feature: "analyst", model: "m", inputTokens: 1000000, actorKind: "viewer", actorKey: "v" },
  ]);
  const usage = await studioQuery(
    m,
    querySchema.parse({ table: "ai_usage", fields: ["ai_usage.day", "ai_usage.cost_cents"] }),
  );
  const cost = (usage.data as { cost_cents: number | string }[]).reduce((s, r) => s + Number(r.cost_cents), 0);
  expect(cost).toBeCloseTo(4);
});
