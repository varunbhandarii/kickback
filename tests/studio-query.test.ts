import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  querySchema,
  querySuffix,
  whereFrom,
  relativeBounds,
} from "@/lib/studio/query";
import { studioQuery } from "@/lib/studio/server-data";
import { setupDb, teardownDb, resetDb, fixture, purchase } from "./helpers/db";
const dialect = new PgDialect(),
  compiled = (v: ReturnType<typeof whereFrom>) => dialect.sqlToQuery(v!);
describe("scoped Studio query translation", () => {
  const cases: [string, unknown][] = [
    ["equals", 5],
    ["notEqual", 5],
    ["greaterThan", 5],
    ["lessThan", 5],
    ["greaterThanOrEqual", 5],
    ["lessThanOrEqual", 5],
    ["between", [1, 5]],
    ["isIn", [1, 5]],
    ["isNull", null],
    ["isNotNull", null],
    ["isUndefined", null],
    ["isNotUndefined", null],
    ["isBlank", null],
    ["isNotBlank", null],
  ];
  it.each(cases)(
    "translates %s without interpolating operands",
    (operator, value) => {
      const q = compiled(
        whereFrom({ field: "visits.amount", operator, value }, "visits", "UTC"),
      );
      expect(q.sql).toContain('"amount"');
      if (typeof value === "number") expect(q.params).toContain(value);
    },
  );
  it.each(["contains", "notContains", "startsWith", "endsWith"])(
    "escapes wildcard input for %s",
    (operator) => {
      const q = compiled(
        whereFrom(
          {
            field: "visits.customer_label",
            operator,
            value: "_%' DROP TABLE visits",
          },
          "visits",
          "UTC",
        ),
      );
      expect(q.sql).not.toContain("DROP");
      expect(String(q.params[0])).toContain("\\_\\%");
    },
  );
  it.each(["isTrue", "isFalse"])(
    "supports %s only for booleans",
    (operator) => {
      expect(
        compiled(
          whereFrom({ field: "visits.qualifying", operator }, "visits", "UTC"),
        ).sql,
      ).toContain(operator === "isTrue" ? "is true" : "is false");
      expect(() =>
        whereFrom({ field: "visits.amount", operator }, "visits", "UTC"),
      ).toThrow();
    },
  );
  it.each([
    "raw_events.payload",
    "rewards.amount",
    "visits.nope",
    "visits.amount.extra",
  ])("rejects invalid field %s", (field) =>
    expect(() =>
      whereFrom({ field, operator: "equals", value: 1 }, "visits", "UTC"),
    ).toThrow(),
  );
  it.each(["regex", "sql", "unknown"])(
    "rejects unknown operator %s",
    (operator) =>
      expect(() =>
        whereFrom(
          { field: "visits.amount", operator, value: 1 },
          "visits",
          "UTC",
        ),
      ).toThrow(),
  );
  it("combines NOT/AND/OR and rejects empty logical filters", () => {
    expect(
      compiled(
        whereFrom(
          {
            operator: "NOT",
            conditions: [
              {
                operator: "OR",
                conditions: [
                  { field: "visits.amount", operator: "equals", value: 1 },
                  { field: "visits.amount", operator: "equals", value: 2 },
                ],
              },
            ],
          },
          "visits",
          "UTC",
        ),
      ).sql,
    ).toContain(" or ");
    expect(() =>
      whereFrom({ operator: "OR", conditions: [] }, "visits", "UTC"),
    ).toThrow();
  });
  it("caps pages and keeps a stable tie breaker", () => {
    const q = dialect.sqlToQuery(
      querySuffix(
        querySchema.parse({
          table: "visits",
          fields: ["visits.id"],
          options: { paging: { pageLimit: 10000, offset: 500 } },
        }),
        "UTC",
      ),
    );
    expect(q.params).toEqual([500, 500]);
    expect(q.sql).toContain('order by "id"');
  });
  it("rejects mismatched selections and sorts", () => {
    expect(() =>
      querySuffix({ table: "visits", fields: ["rewards.id"] }, "UTC"),
    ).toThrow();
    expect(() =>
      querySuffix(
        {
          table: "visits",
          fields: ["visits.id"],
          options: { sort: [{ field: "raw.payload", direction: "asc" }] },
        },
        "UTC",
      ),
    ).toThrow();
  });
  it("uses local calendar dates across DST", () => {
    expect(
      relativeBounds(
        { type: "last", value: 2, unit: "day", includeToday: true },
        "America/New_York",
        new Date("2026-03-09T01:00Z"),
      ),
    ).toEqual(["2026-03-07T05:00:00.000Z", "2026-03-09T04:00:00.000Z"]);
  });
  it("rejects unsupported relative ranges", () =>
    expect(() =>
      relativeBounds({ type: "surprise", unit: "day" }, "UTC"),
    ).toThrow());
});
describe("Studio data isolation", () => {
  beforeAll(setupDb);
  beforeEach(resetDb);
  afterAll(teardownDb);
  it("selects tenant rows only, including a hostile foreign key filter", async () => {
    const a = await fixture(),
      b = await fixture(undefined, "salon");
    await purchase(a, { id: "A", at: new Date() });
    await purchase(b, { id: "B", account: "other", at: new Date() });
    const rows = await studioQuery(a, {
      table: "visits",
      fields: ["visits.id", "visits.amount", "visits.customer_label"],
    });
    expect(rows.data).toHaveLength(1);
    const foreign = await studioQuery(b, {
      table: "customers",
      fields: ["customers.key"],
    });
    const filtered = await studioQuery(a, {
      table: "visits",
      fields: ["visits.id"],
      options: {
        filter: {
          field: "visits.customer_key",
          operator: "equals",
          value: foreign.data[0].key,
        },
      },
    });
    expect(filtered.data).toEqual([]);
    expect(JSON.stringify(rows)).not.toContain("MERCHANT12345");
  });
  it("zero-fills 180 local days and computes reward/visit facts", async () => {
    const a = await fixture();
    await purchase(a, { at: new Date() });
    const result = await studioQuery(a, {
      table: "daily_summary",
      fields: [
        "daily_summary.day",
        "daily_summary.visits",
        "daily_summary.qualifying_visits",
      ],
    });
    expect(result.data).toHaveLength(180);
    expect(result.data.reduce((s, r) => s + Number(r.visits), 0)).toBe(1);
  });
  it("returns a shorter final page and all customer progress fields", async () => {
    const a = await fixture();
    await purchase(a, { at: new Date() });
    const result = await studioQuery(a, {
      table: "customers",
      fields: [
        "customers.label",
        "customers.progress_pct",
        "customers.is_demo",
      ],
      options: { paging: { pageLimit: 2 } },
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].label).toMatch(/^Regular #[A-Z0-9_-]{4}$/);
    expect(
      (
        await studioQuery(a, {
          table: "customers",
          fields: ["customers.label"],
          options: { paging: { offset: 2 } },
        })
      ).data,
    ).toEqual([]);
  });
});
