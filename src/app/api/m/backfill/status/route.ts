import { cookies } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { backfillRuns } from "@/db/schema";
import { getSession, ownedMerchant } from "@/lib/dal";
export async function GET(request: Request) {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  const explicit = new URL(request.url).searchParams.get("merchantId"),
    selected = explicit ?? (await cookies()).get("kickback.merchant")?.value,
    merchant =
      (await ownedMerchant(session.user.id, selected)) ??
      (!explicit ? await ownedMerchant(session.user.id) : undefined);
  if (!merchant)
    return Response.json({ error: "Business not found" }, { status: 404 });
  const [run] = await getDb()
    .select({
      id: backfillRuns.id,
      status: backfillRuns.status,
      rowsSeen: backfillRuns.rowsSeen,
      windowsDone: backfillRuns.windowsDone,
      unrecognized: backfillRuns.unrecognized,
      error: backfillRuns.error,
    })
    .from(backfillRuns)
    .where(
      and(
        eq(backfillRuns.merchantId, merchant.id),
        eq(backfillRuns.kind, "BACKFILL"),
      ),
    )
    .orderBy(desc(backfillRuns.windowTo))
    .limit(1);
  return Response.json(
    { run: run ?? null, stats: merchant.stats },
    { headers: { "Cache-Control": "no-store" } },
  );
}
