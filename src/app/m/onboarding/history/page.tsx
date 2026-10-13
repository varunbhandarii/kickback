import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { backfillRuns, connections } from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
import { SEARCH_SCOPE } from "@/lib/connections";
import HistoryPanel from "./history-panel";
export default async function HistoryPage() {
  const { merchant } = await requireMerchant(),
    [connection] = await getDb()
      .select()
      .from(connections)
      .where(eq(connections.merchantId, merchant.id)),
    [run] = await getDb()
      .select()
      .from(backfillRuns)
      .where(
        and(
          eq(backfillRuns.merchantId, merchant.id),
          eq(backfillRuns.kind, "BACKFILL"),
        ),
      )
      .orderBy(desc(backfillRuns.windowTo))
      .limit(1);
  return (
    <HistoryPanel
      merchantId={merchant.id}
      initial={
        run && {
          id: run.id,
          status: run.status,
          rowsSeen: run.rowsSeen,
          windowsDone: run.windowsDone,
          error: run.error,
        }
      }
      searchEnabled={
        connection?.status === "CONNECTED" &&
        connection.scopes.includes(SEARCH_SCOPE)
      }
      stats={merchant.stats}
    />
  );
}
