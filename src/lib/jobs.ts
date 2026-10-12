import { getDb } from "@/db";
import { rawEvents } from "@/db/schema";
import { sql } from "drizzle-orm";
import { purgeRawEvents } from "./db/purge";
import { confirmSent, reapStale, settleDue } from "./rewards/executor";
import { reprocessWebhooks } from "./webhooks/dispatch";
export async function runJobs() {
  const started = Date.now(), deadline = started+45000;
  const stale = await reapStale();
  const webhooks = await reprocessWebhooks(deadline);
  const settled = Date.now() < deadline-5000 ? await settleDue(25,deadline) : 0;
  const confirmed = Date.now() < deadline-5000 ? await confirmSent(deadline) : 0;
  const deleted = await purgeRawEvents();
  const [overdue] = await getDb().select({ count: sql<number>`count(*)::int` }).from(rawEvents).where(sql`${rawEvents.receivedAt} < now()-interval '48 hours'`);
  if (overdue.count) console.error(JSON.stringify({ action: "retention_overdue", count: overdue.count }));
  return { ok: true, stale, webhooks, settled, confirmed, deleted, retentionOverdue: overdue.count, elapsedMs: Date.now()-started };
}
