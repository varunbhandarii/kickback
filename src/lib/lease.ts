import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
/**
 * A short exclusive lease stored in `settings`, safe across pooled
 * connections and processes. Returns false while someone else holds it.
 */
export async function takeLease(name: string, ms: number, now = new Date()) {
  const key = "lease:" + name,
    value = { until: new Date(+now + ms).toISOString() };
  const rows = await getDb()
    .insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: now },
      setWhere: sql`(${settings.value}->>'until')::timestamptz < ${now.toISOString()}::timestamptz`,
    })
    .returning({ key: settings.key });
  return rows.length > 0;
}
export async function dropLease(name: string) {
  await getDb()
    .delete(settings)
    .where(eq(settings.key, "lease:" + name));
}
