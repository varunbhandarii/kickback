import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, visits } from "@/db/schema";
import { executeAnalystTool, toolRoles, toolSchemas } from "../ai/tools";
import { ApiError } from "./api-actor";
import { assertMember } from "../ai/service";
export async function resolveCode(
  merchantId: string,
  code: string,
  lastSeen?: unknown,
) {
  if (!/^[A-Z0-9_-]{4}$/.test(code))
    throw new ApiError(400, "Use a four-character regular code");
  const rows = await getDb()
    .select({ key: customers.key, lastSeen: customers.lastSeen })
    .from(customers)
    .where(
      and(
        eq(customers.merchantId, merchantId),
        sql`upper(substr(${customers.key},1,4))=${code}`,
      ),
    );
  const candidates =
    lastSeen === undefined
      ? rows
      : rows.filter(
          (r) =>
            typeof lastSeen === "string" &&
            r.lastSeen.toISOString() === lastSeen,
        );
  if (candidates.length !== 1)
    return {
      candidates: rows.map((r, i) => ({
        code,
        choice: i + 1,
        lastSeen: r.lastSeen,
      })),
      message: rows.length
        ? "Multiple regulars share this code; use their last-seen dates to distinguish them. No individual record has been selected."
        : "Regular not found.",
    };
  return { customerKey: candidates[0].key };
}
export async function analystRequest(
  tool: string,
  input: unknown,
  actor: { userId: string; merchantId: string },
) {
  await assertMember(actor.userId, actor.merchantId, toolRoles(tool));
  if (!Object.hasOwn(toolSchemas, tool))
    throw new ApiError(404, "Unknown tool");
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ApiError(400, "Object required");
  const {
    merchantId: _untrustedMerchant,
    customerKey: _untrustedKey,
    ...body
  } = input as Record<string, unknown>;
  void _untrustedMerchant;
  void _untrustedKey;
  if (tool === "explain_customer") {
    const resolved = await resolveCode(
      actor.merchantId,
      String(body.code ?? "").toUpperCase(),
      body.lastSeen,
    );
    if ("candidates" in resolved) return resolved;
    delete body.code;
    delete body.lastSeen;
    body.customerKey = resolved.customerKey;
  }
  const result = await executeAnalystTool(
    tool as keyof typeof toolSchemas,
    { ...body, merchantId: actor.merchantId },
    actor,
  );
  if (tool === "flag_abuse") {
    const [demo] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(visits)
      .where(
        and(
          eq(visits.merchantId, actor.merchantId),
          sql`${visits.source} in ('FIXTURE','REPLAY')`,
        ),
      );
    return { flags: result, includesDemoHistory: demo.n > 0 };
  }
  return result;
}
