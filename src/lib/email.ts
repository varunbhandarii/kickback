import { getEnv } from "./env";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  connections,
  merchants,
  merchantUsers,
  rewards,
  settings,
  user,
  digests,
} from "@/db/schema";
import { digestText, type DigestBody } from "./digests";
export function emailConfigured() {
  const env = getEnv();
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}
export async function sendMerchantEmail(
  to: string,
  subject: string,
  text: string,
  idempotencyKey?: string,
) {
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Merchant email delivery failed");
  return true;
}
export async function sendOperationalNotices(deadline = Date.now() + 10000) {
  if (!emailConfigured()) return 0;
  const businesses = await getDb()
    .select({ merchant: merchants, connection: connections })
    .from(merchants)
    .leftJoin(connections, eq(connections.merchantId, merchants.id));
  let sent = 0;
  for (const { merchant, connection } of businesses) {
    if (Date.now() > deadline - 1000) break;
    const [problems] = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(rewards)
      .where(
        and(
          eq(rewards.merchantId, merchant.id),
          inArray(rewards.state, ["HELD", "FAILED"]),
        ),
      );
    const disconnected = ["REVOKED", "DISCONNECTED", "ERROR"].includes(
      connection?.status ?? "",
    );
    if (!disconnected && !problems.count) continue;
    const key = `email:${merchant.id}:attention`,
      fingerprint = `${new Date().toISOString().slice(0, 10)}:${connection?.status}:${problems.count}`,
      [previous] = await getDb()
        .select()
        .from(settings)
        .where(eq(settings.key, key));
    if (
      (previous?.value as { fingerprint?: string })?.fingerprint === fingerprint
    )
      continue;
    const owners = await getDb()
      .select({ id: user.id, email: user.email })
      .from(merchantUsers)
      .innerJoin(user, eq(user.id, merchantUsers.userId))
      .where(
        and(
          eq(merchantUsers.merchantId, merchant.id),
          eq(merchantUsers.role, "OWNER"),
        ),
      );
    let delivered = false;
    for (const owner of owners) {
      if (/(@example\.com|\.example\.com|\.local|\.test)$/.test(owner.email))
        continue;
      const idempotencyKey = createHash("sha256")
        .update(`${key}:${owner.id}:${fingerprint}`)
        .digest("hex");
      try {
        delivered =
          (await sendMerchantEmail(
            owner.email,
            `Kickback: ${merchant.displayName} needs attention`,
            `${disconnected ? "Your PayPal connection is unavailable. Checkout and future rewards are paused. " : ""}${problems.count} rewards need review. Open your merchant dashboard: ${new URL("/m", getEnv().APP_URL).href}`,
            idempotencyKey,
          )) || delivered;
      } catch {
        console.error(
          JSON.stringify({ action: "merchant_email_delivery_failed" }),
        );
      }
    }
    if (delivered) {
      await getDb()
        .insert(settings)
        .values({ key, value: { fingerprint } })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: { fingerprint }, updatedAt: new Date() },
        });
      sent++;
    }
  }
  await sendDigestEmails(deadline);
  return sent;
}
async function sendDigestEmails(deadline: number) {
  const rows = await getDb()
    .select({ digest: digests, merchant: merchants })
    .from(digests)
    .innerJoin(merchants, eq(merchants.id, digests.merchantId))
    .where(
      and(
        eq(merchants.status, "ACTIVE"),
        sql`${digests.createdAt} > now()-interval '7 days'`,
      ),
    );
  for (const { digest, merchant } of rows) {
    if (Date.now() > deadline - 1000) break;
    const owners = await getDb()
      .select({ id: user.id, email: user.email })
      .from(merchantUsers)
      .innerJoin(user, eq(user.id, merchantUsers.userId))
      .where(
        and(
          eq(merchantUsers.merchantId, merchant.id),
          eq(merchantUsers.role, "OWNER"),
        ),
      );
    for (const owner of owners) {
      if (Date.now() > deadline - 1000) break;
      if (/(@example\.com|\.example\.com|\.local|\.test)$/.test(owner.email))
        continue;
      const key = `email:${merchant.id}:digest:${digest.id}:${owner.id}`,
        [sent] = await getDb()
          .select()
          .from(settings)
          .where(eq(settings.key, key));
      if (sent) continue;
      try {
        if (
          await sendMerchantEmail(
            owner.email,
            `Kickback: ${merchant.displayName} this week`,
            digestText(digest.body as DigestBody) +
              " Open your dashboard: " +
              new URL("/m", getEnv().APP_URL).href,
            createHash("sha256").update(key).digest("hex"),
          )
        )
          await getDb()
            .insert(settings)
            .values({ key, value: { sent: true } })
            .onConflictDoNothing();
      } catch {
        console.error(
          JSON.stringify({ action: "digest_email_delivery_failed" }),
        );
      }
    }
  }
}
