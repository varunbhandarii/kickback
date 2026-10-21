import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
export type Beat = "jobs" | "soak" | "reconcile";
const key = (name: Beat) => `${name}_heartbeat_at`;
/**
 * Records that a background task finished, then pings its uptime monitor
 * when one is configured. Monitor failures are logged and ignored.
 */
export async function beat(name: Beat, monitorUrl?: string, now = new Date()) {
  const value = { at: now.toISOString() };
  await getDb()
    .insert(settings)
    .values({ key: key(name), value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
  if (!monitorUrl) return;
  try {
    await fetch(monitorUrl, { method: "GET", signal: AbortSignal.timeout(3000), cache: "no-store" });
  } catch {
    console.warn(JSON.stringify({ action: "heartbeat_ping_failed", name }));
  }
}
export async function lastBeat(name: Beat) {
  const [row] = await getDb().select().from(settings).where(eq(settings.key, key(name)));
  const at = row && (row.value as { at?: string }).at;
  return at ? new Date(at) : undefined;
}
