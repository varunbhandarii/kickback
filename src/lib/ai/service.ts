import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, type Tx } from "@/db";
import { aiCalls, designRuns, merchantUsers, merchants } from "@/db/schema";
import { loadMerchant } from "../merchants";
import type { Role } from "../dal";
import { designData } from "./designer/context";
import {
  designInputSchema,
  designPipeline,
  type DesignResult,
} from "./designer/pipeline";
import { structured, type StructuredCaller } from "./client";
import { generateScribe } from "./scribe";
import { loadProgram, type ProgramSpec } from "../engine/program";
export async function assertOwner(
  userId: string,
  merchantId: string,
  db: getDbReturn | Tx = getDb(),
) {
  await assertMember(userId, merchantId, ["OWNER"], db);
}
/** Membership with one of `roles`; VIEWER is the read-only demo. */
export async function assertMember(
  userId: string,
  merchantId: string,
  roles: Role[],
  db: getDbReturn | Tx = getDb(),
) {
  const [row] = await db
    .select()
    .from(merchantUsers)
    .where(
      and(
        eq(merchantUsers.userId, userId),
        eq(merchantUsers.merchantId, merchantId),
        inArray(merchantUsers.role, roles),
      ),
    );
  if (!row) throw new Error("NOT_AUTHORIZED");
}
type getDbReturn = ReturnType<typeof getDb>;
export async function createDesign(
  merchantId: string,
  input: unknown,
  userId?: string,
  signal?: AbortSignal,
) {
  if (userId) await assertOwner(userId, merchantId);
  const values = designInputSchema.parse(input),
    [business] = await getDb()
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchantId));
  const merchant = business && (await loadMerchant(business.slug, true));
  if (!merchant || merchant.purgeAfter) throw new Error("BUSINESS_UNAVAILABLE");
  const operationId = randomUUID(),
    caller: StructuredCaller = (opts) => structured({ ...opts, operationId }),
    data = await designData(merchant, values);
  const result = await designPipeline(merchantId, data.context, data.rows, {
    caller,
    signal,
    tz: merchant.tz,
  });
  const calls = await getDb()
    .select()
    .from(aiCalls)
    .where(
      and(
        eq(aiCalls.merchantId, merchantId),
        eq(aiCalls.operationId, operationId),
      ),
    );
  result.aiCallIds = calls.map((c) => c.id);
  result.usage = calls.reduce(
    (u, c) => ({
      inputTokens: u.inputTokens + c.inputTokens,
      outputTokens: u.outputTokens + c.outputTokens,
      cacheReadTokens: u.cacheReadTokens + c.cacheReadTokens,
      cacheWriteTokens: u.cacheWriteTokens + c.cacheWriteTokens,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  );
  const [run] = await getDb()
    .insert(designRuns)
    .values({
      merchantId,
      createdBy: userId,
      result: { kind: "designer", ...result },
      expiresAt: new Date(Date.now() + (userId ? 1 : 8) * 86400000),
    })
    .returning();
  return { id: run.id, ...result };
}
export async function storedDesign(tx: Tx, merchantId: string, runId: string) {
  const [run] = await tx
    .select()
    .from(designRuns)
    .where(and(eq(designRuns.id, runId), eq(designRuns.merchantId, merchantId)))
    .for("update");
  if (
    !run ||
    run.expiresAt < new Date() ||
    (run.result as { kind?: string }).kind !== "designer"
  )
    throw new Error("DESIGN_EXPIRED");
  return run.result as DesignResult;
}
export async function createScribe(
  merchantId: string,
  input: unknown,
  userId: string,
) {
  await assertOwner(userId, merchantId);
  const [business] = await getDb()
    .select()
    .from(merchants)
    .where(eq(merchants.id, merchantId));
  if (!business || business.purgeAfter) throw new Error("BUSINESS_UNAVAILABLE");
  const spec = loadProgram(input),
    operationId = randomUUID(),
    caller: StructuredCaller = (opts) => structured({ ...opts, operationId });
  const generated = await generateScribe(
    merchantId,
    business.displayName,
    business.voiceHints,
    spec,
    business.menu.map((i) => i.name),
    caller,
  );
  const calls = await getDb()
    .select({ id: aiCalls.id })
    .from(aiCalls)
    .where(
      and(
        eq(aiCalls.merchantId, merchantId),
        eq(aiCalls.operationId, operationId),
      ),
    );
  generated.aiCallIds = calls.map((c) => c.id);
  const [run] = await getDb()
    .insert(designRuns)
    .values({
      merchantId,
      createdBy: userId,
      result: { kind: "scribe", generated },
      expiresAt: new Date(Date.now() + 86400000),
    })
    .returning();
  return { id: run.id, ...generated };
}
export function specEdits(original: ProgramSpec, chosen: ProgramSpec) {
  return Object.fromEntries(
    Object.entries(chosen)
      .filter(
        ([key, value]) =>
          JSON.stringify(value) !==
          JSON.stringify(original[key as keyof ProgramSpec]),
      )
      .map(([key, to]) => [
        key,
        { from: original[key as keyof ProgramSpec] ?? null, to },
      ]),
  );
}
