import "server-only";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { cockpitThreads } from "@/db/schema";
import { lockMerchant } from "../ledger/locks";
import { ApiError } from "./api-actor";
const threadSchema = z.object({
  summary: z
    .object({
      threadId: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/),
      agentId: z.string().max(160),
      updatedAt: z.number(),
      title: z.string().max(300).optional(),
      parentThreadId: z.string().max(160).optional(),
    })
    .passthrough(),
  messages: z.array(z.record(z.string(), z.unknown())).max(400),
  artifacts: z.array(z.unknown()).max(30).optional(),
  sharedState: z.unknown().optional(),
});
export async function listThreads(merchantId: string) {
  return (
    await getDb()
      .select({ summary: cockpitThreads.summary })
      .from(cockpitThreads)
      .where(
        and(
          eq(cockpitThreads.merchantId, merchantId),
          lt(cockpitThreads.updatedAt, new Date(Date.now() + 1000)),
        ),
      )
      .orderBy(desc(cockpitThreads.updatedAt))
      .limit(20)
  ).map((r) => r.summary);
}
export async function loadThread(merchantId: string, id: string) {
  const [r] = await getDb()
    .select()
    .from(cockpitThreads)
    .where(
      and(
        eq(cockpitThreads.merchantId, merchantId),
        eq(cockpitThreads.threadId, id),
      ),
    );
  return r
    ? {
        summary: r.summary,
        ...(r.messages as {
          messages: unknown[];
          artifacts?: unknown[];
          sharedState?: unknown;
        }),
      }
    : undefined;
}
export async function saveThread(
  merchantId: string,
  id: string,
  body: unknown,
) {
  const t = threadSchema.parse(body);
  if (id !== t.summary.threadId) throw new ApiError(400, "Thread ID mismatch");
  if (JSON.stringify(t).length > 262144)
    throw new ApiError(413, "Thread too large");
  await getDb().transaction(async (tx) => {
    await lockMerchant(tx, merchantId);
    const [existing] = await tx
      .select()
      .from(cockpitThreads)
      .where(eq(cockpitThreads.threadId, id));
    if (existing && existing.merchantId !== merchantId)
      throw new ApiError(403, "Thread unavailable");
    const { summary, ...content } = t;
    await tx
      .insert(cockpitThreads)
      .values({ merchantId, threadId: id, summary, messages: content })
      .onConflictDoUpdate({
        target: cockpitThreads.threadId,
        set: { summary, messages: content, updatedAt: new Date() },
      });
    const old = await tx
      .select({ id: cockpitThreads.threadId })
      .from(cockpitThreads)
      .where(eq(cockpitThreads.merchantId, merchantId))
      .orderBy(desc(cockpitThreads.updatedAt))
      .offset(20);
    if (old.length)
      await tx.delete(cockpitThreads).where(
        and(
          eq(cockpitThreads.merchantId, merchantId),
          inArray(
            cockpitThreads.threadId,
            old.map((r) => r.id),
          ),
        ),
      );
  });
}
export async function deleteThread(merchantId: string, id: string) {
  await getDb()
    .delete(cockpitThreads)
    .where(
      and(
        eq(cockpitThreads.merchantId, merchantId),
        eq(cockpitThreads.threadId, id),
      ),
    );
}
