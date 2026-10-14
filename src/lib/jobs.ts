import { getDb } from "@/db";
import { rawEvents } from "@/db/schema";
import { sql } from "drizzle-orm";
import { purgeRawEvents } from "./db/purge";
import { confirmSent, reapStale, settleDue } from "./rewards/executor";
import { reprocessWebhooks } from "./webhooks/dispatch";
import { purgeOperationalMetadata, purgeTenants } from "./db/purge-tenants";
import { sweepHistory } from "./history/worker";
import { sendOperationalNotices } from "./email";
import { refreshNotices } from "./guard/notices";
import { weeklySuggestions } from "./ai/weekly";
export async function runJobs() {
  const started = Date.now(),
    deadline = started + 45000;
  const stale = await reapStale();
  const webhooks = await reprocessWebhooks(deadline);
  const settled =
    Date.now() < deadline - 5000 ? await settleDue(25, deadline) : 0;
  const confirmed =
    Date.now() < deadline - 5000 ? await confirmSent(deadline) : 0;
  const history =
    Date.now() < deadline - 5000 ? await sweepHistory(deadline) : 0;
  const tenantsPurged = await purgeTenants();
  const metadataPurged = await purgeOperationalMetadata();
  const deleted = await purgeRawEvents();
  const notices =
    Date.now() < deadline - 2000 ? await sendOperationalNotices(deadline) : 0;
  const guardNotices =
    Date.now() < deadline - 5000 ? await refreshNotices(deadline) : 0;
  const ideas =
    Date.now() < deadline - 10000 ? await weeklySuggestions(deadline) : 0;
  const [overdue] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(rawEvents)
    .where(sql`${rawEvents.receivedAt} < now()-interval '48 hours'`);
  if (overdue.count)
    console.error(
      JSON.stringify({ action: "retention_overdue", count: overdue.count }),
    );
  return {
    ok: true,
    stale,
    webhooks,
    settled,
    confirmed,
    history,
    tenantsPurged,
    metadataPurged,
    notices,
    guardNotices,
    ideas,
    deleted,
    retentionOverdue: overdue.count,
    elapsedMs: Date.now() - started,
  };
}
