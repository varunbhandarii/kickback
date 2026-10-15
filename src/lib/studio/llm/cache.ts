import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { aiTurnCache } from "@/db/schema";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
// Durable rows are authoritative for retention and tenant deletion; no stale process cache.
export async function cachedTurn(merchantId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(aiTurnCache)
    .where(
      and(
        eq(aiTurnCache.merchantId, merchantId),
        eq(aiTurnCache.toolUseId, id),
        gte(aiTurnCache.createdAt, new Date(Date.now() - 86400000)),
      ),
    );
  return row?.content as ContentBlockParam[] | undefined;
}
export async function saveTurn(
  merchantId: string,
  content: ContentBlockParam[],
) {
  for (const c of content)
    if (c.type === "tool_use") {
      await getDb()
        .insert(aiTurnCache)
        .values({ merchantId, toolUseId: c.id, content })
        .onConflictDoNothing();
    }
}
