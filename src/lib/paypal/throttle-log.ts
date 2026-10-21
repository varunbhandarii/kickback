import { inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
const hourKey = (at: Date) => "paypal_429:" + at.toISOString().slice(0, 13);
/** One counter row per UTC hour, shared by every service. Old rows are purged with other metadata. */
export async function recordThrottle(now = new Date()) {
  await getDb()
    .insert(settings)
    .values({ key: hourKey(now), value: { n: 1 } })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: sql`jsonb_build_object('n', coalesce((${settings.value}->>'n')::int, 0) + 1)`,
        updatedAt: now,
      },
    });
}
/** Throttles in this hour and the previous one. */
export async function recentThrottles(now = new Date()) {
  const rows = await getDb()
    .select({ value: settings.value })
    .from(settings)
    .where(inArray(settings.key, [hourKey(now), hourKey(new Date(+now - 3600000))]));
  return rows.reduce((s, r) => s + Number((r.value as { n?: number }).n ?? 0), 0);
}
