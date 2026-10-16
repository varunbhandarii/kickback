import { createHash } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, rewards } from "@/db/schema";
import { verifyProgressToken } from "../crypto/progress-token";
import { loadMerchant } from "../merchants";
import { getEnv } from "../env";
import { allowRequest } from "../rate-limit";
import { ruleInWords } from "../studio/context";
import type { Progress } from "../engine/evaluate";
export async function readProgress(
  slug: string,
  token: string,
  ip: string,
  now = new Date(),
) {
  if (
    !allowRequest(`progress:${ip}`, 60) ||
    !allowRequest(
      `progress-token:${createHash("sha256").update(token.slice(0, 513)).digest("hex")}`,
      30,
    )
  )
    return { error: "Please try again shortly." };
  const p = verifyProgressToken(token, +now, getEnv().PROGRESS_LINK_TTL_DAYS);
  if (!p) return { error: "This link is invalid or has expired." };
  const merchant = await loadMerchant(slug, true);
  if (!merchant || merchant.id !== p.m)
    return { error: "This link is invalid or has expired." };
  if (
    merchant.purgeAfter ||
    ["DISCONNECTED", "ONBOARDING"].includes(merchant.status) ||
    merchant.program.status !== "ACTIVE"
  )
    return { error: "This program has ended." };
  const [person] = await getDb()
    .select({ progress: customers.progress, lastSeen: customers.lastSeen })
    .from(customers)
    .where(and(eq(customers.merchantId, p.m), eq(customers.key, p.c)));
  if (!person) return { error: "This program has ended." };
  const [paid] = await getDb()
    .select({
      count: sql<number>`count(*)::int`,
      cents: sql<number>`coalesce(sum(${rewards.amountCents}-${rewards.offsetAppliedCents}),0)::int`,
    })
    .from(rewards)
    .where(
      and(
        eq(rewards.merchantId, p.m),
        eq(rewards.customerKey, p.c),
        inArray(rewards.state, ["SENT", "CONFIRMED"]),
        gte(rewards.sentAt, new Date(+now - 90 * 86400000)),
      ),
    );
  return {
    name: merchant.displayName,
    rule: ruleInWords(merchant.spec),
    tz: merchant.tz,
    progress: person.progress as Progress,
    lastSeen: person.lastSeen,
    paid,
  };
}
