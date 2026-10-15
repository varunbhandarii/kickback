import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { sourceFields, type StudioTable } from "./sources";
import { localDay } from "../engine/evaluate";
export class QueryError extends Error {}
export const querySchema = z.strictObject({
  table: z.enum(["customers", "visits", "rewards", "daily_summary"]),
  fields: z.array(z.string()).min(1).max(40),
  options: z
    .object({
      filter: z.unknown().optional(),
      sort: z
        .array(
          z.strictObject({
            field: z.string(),
            direction: z.enum(["asc", "desc"]),
          }),
        )
        .max(20)
        .optional(),
      paging: z
        .object({
          offset: z.number().int().min(0).max(1000000).optional(),
          pageLimit: z.number().int().min(1).optional(),
        })
        .optional(),
    })
    .optional(),
});
function column(field: string, table: StudioTable): SQL {
  const [t, name, extra] = field.split(".");
  if (t !== table || extra || !Object.hasOwn(sourceFields[table], name))
    throw new QueryError("Unknown field " + field);
  return (sourceFields[table] as Record<string, string>)[name] === "date"
    ? sql`${sql.identifier(name)}::date`
    : sql`${sql.identifier(name)}`;
}
// Calendar arithmetic happens on local dates before conversion, preserving DST days.
export function zonedMidnight(day: string, tz: string) {
  const target = Date.parse(day + "T00:00:00Z");
  let value = target;
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(value)
        .map((p) => [p.type, p.value]),
    );
    const represented = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
    );
    value += target - represented;
  }
  return new Date(value);
}
export function relativeBounds(
  value: unknown,
  tz: string,
  now = new Date(),
  dateOnly = false,
): [string, string] {
  const v = z
    .strictObject({
      type: z.enum(["last", "next", "this"]),
      value: z.number().int().min(1).max(365).optional(),
      unit: z.enum(["minute", "hour", "day", "week", "month", "year"]),
      includeToday: z.boolean().optional(),
    })
    .safeParse(value);
  if (!v.success) throw new QueryError("Unsupported relative range");
  const { type, unit, includeToday } = v.data,
    n = v.data.value ?? 1;
  if (["minute", "hour"].includes(unit)) {
    if (dateOnly)
      throw new QueryError("Time units are not supported on date fields");
    const size = unit === "hour" ? 3600000 : 60000,
      start = Math.floor(+now / size) * size;
    return [
      new Date(
        type === "last" ? +now - n * size : type === "next" ? +now : start,
      ).toISOString(),
      new Date(
        type === "last"
          ? +now
          : type === "next"
            ? +now + n * size
            : start + size,
      ).toISOString(),
    ];
  }
  const today = new Date(localDay(now, tz) + "T00:00:00Z"),
    shift = (d: Date, count: number) => {
      const copy = new Date(d);
      if (unit === "month") copy.setUTCMonth(copy.getUTCMonth() + count);
      else if (unit === "year")
        copy.setUTCFullYear(copy.getUTCFullYear() + count);
      else
        copy.setUTCDate(copy.getUTCDate() + count * (unit === "week" ? 7 : 1));
      return copy;
    };
  let start = new Date(today),
    end = new Date(today);
  if (type === "this") {
    if (unit === "week")
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    if (unit === "month") start.setUTCDate(1);
    if (unit === "year") {
      start.setUTCMonth(0);
      start.setUTCDate(1);
    }
    end = shift(start, 1);
  } else if (type === "last") {
    end.setUTCDate(end.getUTCDate() + (includeToday ? 1 : 0));
    start = shift(end, -n);
  } else {
    start.setUTCDate(start.getUTCDate() + (includeToday ? 0 : 1));
    end = shift(start, n);
  }
  const a = start.toISOString().slice(0, 10),
    b = end.toISOString().slice(0, 10);
  return dateOnly
    ? [a, b]
    : [zonedMidnight(a, tz).toISOString(), zonedMidnight(b, tz).toISOString()];
}
type Filter = {
  operator: string;
  field?: string;
  value?: unknown;
  conditions?: unknown[];
};
export function whereFrom(
  input: unknown,
  table: StudioTable,
  tz: string,
  now = new Date(),
  depth = 0,
): SQL | undefined {
  if (input === undefined) return;
  if (depth > 8 || !input || typeof input !== "object")
    throw new QueryError("Invalid filter");
  const f = input as Filter;
  if (f.conditions !== undefined) {
    if (
      !["AND", "OR", "NOT"].includes(f.operator) ||
      !Array.isArray(f.conditions) ||
      f.conditions.length < 1 ||
      f.conditions.length > 50
    )
      throw new QueryError("Invalid logical filter");
    const parts = f.conditions.map(
      (c) => whereFrom(c, table, tz, now, depth + 1)!,
    );
    const body = sql`(${sql.join(parts, f.operator === "OR" ? sql` or ` : sql` and `)})`;
    return f.operator === "NOT" ? sql`not ${body}` : body;
  }
  const col = column(String(f.field), table),
    kind = (sourceFields[table] as Record<string, string>)[
      String(f.field).split(".")[1]
    ],
    v = f.value;
  const scalar = (x: unknown) => {
    if (
      x === null ||
      !["string", "number", "boolean"].includes(typeof x) ||
      (typeof x === "number" && !Number.isFinite(x))
    )
      throw new QueryError("Invalid filter operand");
    if (
      ["integer", "currency", "percentage"].includes(kind) &&
      (typeof x !== "number" || !Number.isFinite(x))
    )
      throw new QueryError("Expected number");
    if (kind === "boolean" && typeof x !== "boolean")
      throw new QueryError("Expected boolean");
    if (
      ["date", "datetime"].includes(kind) &&
      (typeof x !== "string" || !Number.isFinite(Date.parse(x)))
    )
      throw new QueryError("Expected date");
    return x;
  };
  switch (f.operator) {
    case "equals":
      return sql`${col} = ${scalar(v)}`;
    case "notEqual":
      return sql`${col} <> ${scalar(v)}`;
    case "greaterThan":
      return sql`${col} > ${scalar(v)}`;
    case "lessThan":
      return sql`${col} < ${scalar(v)}`;
    case "greaterThanOrEqual":
      return sql`${col} >= ${scalar(v)}`;
    case "lessThanOrEqual":
      return sql`${col} <= ${scalar(v)}`;
    case "between":
      if (!Array.isArray(v) || v.length !== 2)
        throw new QueryError("Expected two bounds");
      return sql`${col} between ${scalar(v[0])} and ${scalar(v[1])}`;
    case "isIn":
      if (!Array.isArray(v) || v.length > 500)
        throw new QueryError("Invalid set");
      return v.length
        ? sql`${col} in (${sql.join(
            v.map((x) => sql`${scalar(x)}`),
            sql`, `,
          )})`
        : sql`false`;
    case "isNull":
    case "isUndefined":
      return sql`${col} is null`;
    case "isNotNull":
    case "isNotUndefined":
      return sql`${col} is not null`;
    case "isBlank":
      return sql`coalesce(${col}::text, '') = ''`;
    case "isNotBlank":
      return sql`coalesce(${col}::text, '') <> ''`;
    case "isTrue":
    case "isFalse":
      if (kind !== "boolean") throw new QueryError("Expected boolean field");
      return f.operator === "isTrue"
        ? sql`${col} is true`
        : sql`${col} is false`;
    case "contains":
    case "notContains":
    case "startsWith":
    case "endsWith": {
      if (kind !== "text" || typeof v !== "string" || v.length > 1000)
        throw new QueryError("Expected text");
      const escaped = v.replace(/[\\%_]/g, "\\$&"),
        pattern =
          (f.operator === "endsWith" ||
          f.operator.includes("Contains") ||
          f.operator === "contains"
            ? "%"
            : "") +
          escaped +
          (f.operator !== "endsWith" ? "%" : "");
      return f.operator === "notContains"
        ? sql`${col} not ilike ${pattern}`
        : sql`${col} ilike ${pattern}`;
    }
    case "inRelativeRange": {
      if (!["date", "datetime"].includes(kind))
        throw new QueryError("Expected date field");
      const [a, b] = relativeBounds(v, tz, now, kind === "date");
      return sql`${col} >= ${a} and ${col} < ${b}`;
    }
    default:
      throw new QueryError("Unsupported operator " + f.operator);
  }
}
export function querySuffix(
  body: z.infer<typeof querySchema>,
  tz: string,
  now = new Date(),
) {
  const fields = body.fields.map((f) => {
    const col = column(f, body.table);
    return sql`${col} as ${sql.identifier(f.split(".")[1])}`;
  });
  const filter = whereFrom(body.options?.filter, body.table, tz, now),
    sorts = body.options?.sort?.map(
      (s) =>
        sql`${column(s.field, body.table)} ${s.direction === "desc" ? sql`desc` : sql`asc`} nulls last`,
    );
  const stable = column(
    body.table +
      "." +
      (body.table === "customers"
        ? "key"
        : body.table === "daily_summary"
          ? "day"
          : "id"),
    body.table,
  );
  return sql`select ${sql.join(fields, sql`, `)} from rows ${filter ? sql`where ${filter}` : sql``} order by ${sorts?.length ? sql`${sql.join(sorts, sql`, `)}, ` : sql``}${stable} limit ${Math.min(500, body.options?.paging?.pageLimit ?? 500)} offset ${body.options?.paging?.offset ?? 0}`;
}
