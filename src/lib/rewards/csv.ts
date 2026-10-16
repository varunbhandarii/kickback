import { and, eq, gte, lt, asc } from "drizzle-orm";
import { getDb } from "@/db";
import { rewards, captures, programs } from "@/db/schema";
import { zonedMidnight } from "../studio/query";
export const rewardCsvColumns = [
  "reward_id",
  "kind",
  "state",
  "created_at",
  "sent_at",
  "amount_cents",
  "offset_cents",
  "net_cents",
  "refund_id",
  "capture_id",
  "order_id",
  "program_version",
  "guard_score",
  "reason",
];
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^\s*[=+\-@]|^[\t\r\n]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}
const localDate = (d: Date | null, tz: string) =>
  d
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: tz,
        dateStyle: "short",
        timeStyle: "medium",
      }).format(d)
    : "";
export function rewardsCsv(merchant: { id: string; tz: string }, year: number) {
  if (
    !Number.isInteger(year) ||
    year < 2020 ||
    year > new Date().getUTCFullYear()
  )
    throw new Error("Invalid tax year");
  const encoder = new TextEncoder();
  let offset = 0,
    header = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!header) {
          controller.enqueue(
            encoder.encode(rewardCsvColumns.join(",") + "\r\n"),
          );
          header = true;
          return;
        }
        if (offset >= 50000) {
          controller.close();
          return;
        }
        const rows = await getDb()
          .select({
            r: rewards,
            orderId: captures.orderId,
            version: programs.version,
          })
          .from(rewards)
          .leftJoin(
            captures,
            and(
              eq(captures.id, rewards.captureId),
              eq(captures.merchantId, merchant.id),
            ),
          )
          .leftJoin(
            programs,
            and(
              eq(programs.id, rewards.programId),
              eq(programs.merchantId, merchant.id),
            ),
          )
          .where(
            and(
              eq(rewards.merchantId, merchant.id),
              gte(
                rewards.createdAt,
                zonedMidnight(`${year}-01-01`, merchant.tz),
              ),
              lt(
                rewards.createdAt,
                zonedMidnight(`${year + 1}-01-01`, merchant.tz),
              ),
            ),
          )
          .orderBy(asc(rewards.createdAt), asc(rewards.id))
          .limit(500)
          .offset(offset);
        if (!rows.length) {
          controller.close();
          return;
        }
        offset += rows.length;
        controller.enqueue(
          encoder.encode(
            rows
              .map(({ r, orderId, version }) =>
                [
                  r.id,
                  r.kind,
                  r.state,
                  localDate(r.createdAt, merchant.tz),
                  localDate(r.sentAt, merchant.tz),
                  r.amountCents,
                  r.offsetAppliedCents,
                  r.amountCents - r.offsetAppliedCents,
                  r.refundId,
                  r.captureId,
                  orderId,
                  version,
                  r.guardScore,
                  r.reason,
                ]
                  .map(csvCell)
                  .join(","),
              )
              .join("\r\n") + "\r\n",
          ),
        );
      } catch {
        controller.error(new Error("Export unavailable"));
      }
    },
  });
}
