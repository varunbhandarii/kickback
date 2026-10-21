export const metadata = { title: "Read your history" };
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { backfillRuns, connections } from "@/db/schema";
import { requireOwnerMerchant } from "@/lib/dal";
import { SEARCH_SCOPE } from "@/lib/connections";
import HistoryPanel from "./history-panel";
export default async function HistoryPage() {
  const { merchant } = await requireOwnerMerchant(),
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
    <div className="setup-grid">
      <div className="setup-main">
        <div className="flex flex-col gap-1.5">
          <h1 className="page-title">Read your history</h1>
          <p className="page-sub" style={{ fontSize: 15 }}>
            Your regulars keep the visits they already have, and the program designer learns from your real sales.
          </p>
        </div>
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
      </div>
      <aside className="setup-aside">
        <div className="card card-tint card-pad flex flex-col gap-1.5">
          <h2 className="card-title">Nothing is paid for past visits</h2>
          <p style={{ fontSize: 14, lineHeight: 1.55 }}>
            History only sets each customer&apos;s starting progress. Refunds start with milestones reached after you
            activate a program.
          </p>
        </div>
      </aside>
    </div>
  );
}
