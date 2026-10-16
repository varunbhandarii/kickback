import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  backfillRuns,
  connections,
  customers,
  historyEvents,
  merchants,
  rewards,
  settings,
} from "@/db/schema";
import { getEnv } from "../env";
import { connectionContext, loadMerchant } from "../merchants";
import { assertConnectionOwner, SEARCH_SCOPE } from "../connections";
import { lockMerchant } from "../ledger/locks";
import { audit } from "../audit";
import { enqueue } from "../rewards/enqueue";
import { applyRewardRefund } from "../ledger/clawback";
import { PayPalApiError } from "../paypal/client";
import {
  classify,
  historyEventKey,
  historyWindows,
  type SearchRow,
} from "./classify";
import { persistHistoryItem } from "./persist";
import { computeHistoryStats } from "./stats";
type SearchPage = {
  account_number?: string;
  transaction_details?: SearchRow[];
  total_pages?: number;
  page?: number;
};
type Client = Pick<
  Awaited<ReturnType<typeof connectionContext>>["client"],
  "request"
>;
export async function startBackfill(
  merchantId: string,
  userId?: string,
  kind = "BACKFILL",
  force = false,
  now = new Date(),
) {
  return getDb().transaction(async (tx) => {
    if (userId) await assertConnectionOwner(tx, userId, merchantId);
    await lockMerchant(tx, merchantId);
    const [merchant] = await tx
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId)),
      [connection] = await tx
        .select()
        .from(connections)
        .where(eq(connections.merchantId, merchantId));
    if (!merchant || merchant.purgeAfter || connection?.status !== "CONNECTED")
      throw new Error("Connect your business before importing history");
    if (!connection.scopes.includes(SEARCH_SCOPE))
      throw new Error("Enable Transaction Search to import history");
    const [active] = await tx
      .select()
      .from(backfillRuns)
      .where(
        and(
          eq(backfillRuns.merchantId, merchantId),
          inArray(backfillRuns.status, ["QUEUED", "RUNNING"]),
        ),
      );
    if (active) {
      if (kind === "BACKFILL" && active.kind !== "BACKFILL")
        throw new Error("HISTORY_BUSY");
      return active;
    }
    const [last] = await tx
      .select()
      .from(backfillRuns)
      .where(
        and(
          eq(backfillRuns.merchantId, merchantId),
          eq(backfillRuns.kind, kind),
        ),
      )
      .orderBy(desc(backfillRuns.windowTo))
      .limit(1);
    if (last?.status === "DONE" && kind === "BACKFILL" && !force) return last;
    if (
      kind === "RECONCILE" &&
      last?.status === "FAILED" &&
      last.finishedAt &&
      +last.finishedAt >
        Date.now() - getEnv().RECONCILE_INTERVAL_HOURS * 3600000
    )
      return last;
    const [run] = await tx
      .insert(backfillRuns)
      .values({
        merchantId,
        kind,
        windowFrom: new Date(
          now.getTime() -
            (kind === "BACKFILL" ? getEnv().BACKFILL_DAYS : 2) * 86400000,
        ),
        windowTo: now,
      })
      .returning();
    await audit(tx, merchantId, "history.started", merchantId, { kind });
    return run;
  });
}
export async function runBackfill(
  runId: string,
  deadline = Date.now() + 45000,
  providedClient?: Client,
) {
  const lease = randomUUID();
  const claimed = await getDb().transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(backfillRuns)
      .where(
        and(
          eq(backfillRuns.id, runId),
          or(
            eq(backfillRuns.status, "QUEUED"),
            and(
              eq(backfillRuns.status, "RUNNING"),
              or(
                isNull(backfillRuns.heartbeatAt),
                lt(backfillRuns.heartbeatAt, new Date(Date.now() - 90000)),
              ),
            ),
          ),
        ),
      )
      .for("update", { skipLocked: true });
    if (!run) return;
    const [updated] = await tx
      .update(backfillRuns)
      .set({
        status: "RUNNING",
        startedAt: run.startedAt ?? new Date(),
        heartbeatAt: new Date(),
        checkpoint: { ...run.checkpoint, lease },
        error: null,
      })
      .where(eq(backfillRuns.id, runId))
      .returning();
    return updated;
  });
  if (!claimed) return { claimed: false };
  let run = claimed;
  try {
    const [row] = await getDb()
      .select()
      .from(merchants)
      .where(eq(merchants.id, run.merchantId));
    const merchant = row && (await loadMerchant(row.slug, true));
    if (!merchant) throw new Error("Business unavailable");
    const ctx = await connectionContext(merchant.id),
      client = providedClient ?? ctx.client,
      windows = historyWindows(run.windowFrom, run.windowTo);
    while (
      (run.checkpoint.window ?? 0) < windows.length &&
      Date.now() < deadline - 5000
    ) {
      const windowIndex = run.checkpoint.window ?? 0,
        window = windows[windowIndex],
        page = run.checkpoint.page ?? 1;
      const params = new URLSearchParams({
        start_date: window.from.toISOString(),
        end_date: window.to.toISOString(),
        fields: "transaction_info,payer_info",
        transaction_status: "S",
        page_size: "500",
        page: String(page),
      });
      const result = await client.request<SearchPage>(
        `/v1/reporting/transactions?${params}`,
        { merchantId: ctx.assertionMerchantId, priority: "low", deadline },
      );
      if (
        result.account_number &&
        result.account_number !== ctx.connection.merchantIdInPayPal
      )
        throw new Error("REPORT_ACCOUNT_MISMATCH");
      if ((result.total_pages ?? 1) > 20 || page > 20)
        throw new Error("HISTORY_VOLUME_LIMIT");
      const rows = result.transaction_details ?? [];
      for (
        let index = run.checkpoint.offset ?? 0;
        index < rows.length;
        index++
      ) {
        if (Date.now() >= deadline - 3000) break;
        const item = classify(merchant.id, rows[index]);
        // Match an earned refund before the generic foreign-refund path.
        if (item?.kind === "REFUND") {
          const [reward] = await getDb()
            .select()
            .from(rewards)
            .where(
              and(
                eq(rewards.merchantId, merchant.id),
                item.rewardId
                  ? eq(rewards.id, item.rewardId)
                  : eq(rewards.refundId, item.id),
              ),
            )
            .limit(1);
          if (
            reward &&
            (!item.reference || reward.captureId === item.reference)
          ) {
            await applyRewardRefund(
              reward.id,
              { id: item.id, status: "COMPLETED", amountCents: item.amount },
              false,
            );
            item.reference = undefined;
          }
        }
        run = await getDb().transaction(async (tx) => {
          await lockMerchant(tx, merchant.id);
          const [current] = await tx
              .select()
              .from(backfillRuns)
              .where(eq(backfillRuns.id, runId))
              .for("update"),
            [connection] = await tx
              .select()
              .from(connections)
              .where(eq(connections.merchantId, merchant.id)),
            [business] = await tx
              .select()
              .from(merchants)
              .where(eq(merchants.id, merchant.id));
          if (
            current?.checkpoint.lease !== lease ||
            current.status !== "RUNNING" ||
            connection?.status !== "CONNECTED" ||
            business?.purgeAfter
          )
            throw new Error("IMPORT_CANCELLED");
          const stored = item
            ? await persistHistoryItem(tx, merchant, item)
            : undefined;
          const [updated] = await tx
            .update(backfillRuns)
            .set({
              rowsSeen: current.rowsSeen + 1,
              visitsCreated:
                current.visitsCreated + (stored?.visitCreated ? 1 : 0),
              unrecognized:
                current.unrecognized +
                (stored?.fresh && item?.kind === "UNRECOGNIZED" ? 1 : 0),
              refundsApplied:
                current.refundsApplied +
                (stored?.fresh && item?.kind === "REFUND" ? 1 : 0),
              heartbeatAt: new Date(),
              checkpoint: {
                window: windowIndex,
                page,
                offset: index + 1,
                lease,
              },
            })
            .where(eq(backfillRuns.id, runId))
            .returning();
          return updated;
        });
      }
      if ((run.checkpoint.offset ?? 0) < rows.length) break;
      const nextPage = page < (result.total_pages ?? 1);
      const [updated] = await getDb()
        .update(backfillRuns)
        .set({
          windowsDone: windowIndex + (nextPage ? 0 : 1),
          checkpoint: {
            window: windowIndex + (nextPage ? 0 : 1),
            page: nextPage ? page + 1 : 1,
            offset: 0,
            lease,
          },
          heartbeatAt: new Date(),
        })
        .where(
          and(
            eq(backfillRuns.id, runId),
            sql`${backfillRuns.checkpoint}->>'lease' = ${lease}`,
            eq(backfillRuns.status, "RUNNING"),
          ),
        )
        .returning();
      if (!updated) throw new Error("IMPORT_CANCELLED");
      run = updated;
    }
    if (
      (run.checkpoint.window ?? 0) >= windows.length &&
      Date.now() < deadline - 3000
    ) {
      let remaining = true;
      while (remaining && Date.now() < deadline - 4000) {
        const people = await getDb()
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.merchantId, merchant.id),
              ...(run.checkpoint.finalizedKey
                ? [gt(customers.key, run.checkpoint.finalizedKey)]
                : []),
            ),
          )
          .orderBy(customers.key)
          .limit(10);
        if (!people.length) {
          remaining = false;
          break;
        }
        for (const person of people) {
          if (Date.now() > deadline - 3000) break;
          run = await getDb().transaction(async (tx) => {
            await lockMerchant(tx, merchant.id);
            const [current] = await tx
                .select()
                .from(backfillRuns)
                .where(eq(backfillRuns.id, runId))
                .for("update"),
              [connection] = await tx
                .select()
                .from(connections)
                .where(eq(connections.merchantId, merchant.id));
            if (
              current?.checkpoint.lease !== lease ||
              current.status !== "RUNNING" ||
              connection?.status !== "CONNECTED"
            )
              throw new Error("IMPORT_CANCELLED");
            await enqueue(
              tx,
              merchant,
              person.key,
              new Date(),
              run.kind === "BACKFILL" ? run.windowTo : undefined,
            );
            const [updated] = await tx
              .update(backfillRuns)
              .set({
                heartbeatAt: new Date(),
                checkpoint: { ...current.checkpoint, finalizedKey: person.key },
              })
              .where(eq(backfillRuns.id, runId))
              .returning();
            return updated;
          });
        }
      }
      if (remaining) {
        await getDb()
          .update(backfillRuns)
          .set({ status: "QUEUED", heartbeatAt: new Date() })
          .where(
            and(
              eq(backfillRuns.id, runId),
              eq(backfillRuns.status, "RUNNING"),
              sql`${backfillRuns.checkpoint}->>'lease' = ${lease}`,
            ),
          );
        return { claimed: true, done: false };
      }
      await getDb().transaction(async (tx) => {
        await lockMerchant(tx, merchant.id);
        const [current] = await tx
            .select()
            .from(backfillRuns)
            .where(eq(backfillRuns.id, runId))
            .for("update"),
          [connection] = await tx
            .select()
            .from(connections)
            .where(eq(connections.merchantId, merchant.id));
        if (
          current?.checkpoint.lease !== lease ||
          current.status !== "RUNNING" ||
          connection?.status !== "CONNECTED"
        )
          throw new Error("IMPORT_CANCELLED");
        const stats = await computeHistoryStats(tx, merchant);
        await tx
          .update(backfillRuns)
          .set({
            status: "DONE",
            customers: stats.customers,
            finishedAt: new Date(),
            heartbeatAt: new Date(),
          })
          .where(eq(backfillRuns.id, runId));
        if (run.kind === "RECONCILE") {
          await tx
            .update(connections)
            .set({ lastReconciledAt: new Date() })
            .where(eq(connections.merchantId, merchant.id));
          const unmatched = await tx
            .select()
            .from(rewards)
            .where(
              and(
                eq(rewards.merchantId, merchant.id),
                inArray(rewards.state, ["SENT", "CONFIRMED"]),
                lt(rewards.sentAt, new Date(Date.now() - 6 * 3600000)),
              ),
            );
          const imported = await tx
            .select()
            .from(historyEvents)
            .where(
              and(
                eq(historyEvents.merchantId, merchant.id),
                eq(historyEvents.kind, "REFUND"),
              ),
            );
          const keys = new Set(imported.map((row) => row.key));
          for (const reward of unmatched) {
            const key = `reward:${merchant.id}:${reward.id}:unreconciled`,
              matched =
                reward.refundId &&
                keys.has(
                  historyEventKey(merchant.id, reward.refundId, "T1107"),
                );
            if (matched) await tx.delete(settings).where(eq(settings.key, key));
            else {
              const [added] = await tx
                .insert(settings)
                .values({ key, value: { rewardId: reward.id } })
                .onConflictDoNothing()
                .returning();
              if (added)
                await audit(tx, merchant.id, "reward.unreconciled", reward.id, {
                  count: 1,
                });
            }
          }
        } else
          await tx
            .update(merchants)
            .set({ onboardingStep: "program" })
            .where(
              and(
                eq(merchants.id, merchant.id),
                eq(merchants.onboardingStep, "history"),
              ),
            );
        await audit(tx, merchant.id, "history.completed", merchant.id, {
          kind: run.kind,
          rows: run.rowsSeen,
          payments: stats.payments,
          customers: stats.customers,
          unrecognized: stats.unrecognizedPayments,
        });
      });
      return { claimed: true, done: true };
    }
    await getDb()
      .update(backfillRuns)
      .set({ status: "QUEUED", heartbeatAt: new Date() })
      .where(
        and(
          eq(backfillRuns.id, runId),
          eq(backfillRuns.status, "RUNNING"),
          sql`${backfillRuns.checkpoint}->>'lease' = ${lease}`,
        ),
      );
    return { claimed: true, done: false };
  } catch (error) {
    const reason =
      error instanceof PayPalApiError
        ? error.status === 403
          ? "SEARCH_PERMISSION_REQUIRED"
          : "PAYPAL_UNAVAILABLE"
        : error instanceof Error &&
            [
              "HISTORY_VOLUME_LIMIT",
              "IMPORT_CANCELLED",
              "REPORT_ACCOUNT_MISMATCH",
            ].includes(error.message)
          ? error.message
          : "HISTORY_RETRY_REQUIRED";
    await getDb()
      .update(backfillRuns)
      .set({ status: "FAILED", error: reason, finishedAt: new Date() })
      .where(
        and(
          eq(backfillRuns.id, runId),
          eq(backfillRuns.status, "RUNNING"),
          sql`${backfillRuns.checkpoint}->>'lease' = ${lease}`,
        ),
      );
    return { claimed: true, error: reason };
  }
}
export async function sweepHistory(deadline: number) {
  const eligible = await getDb()
    .select({ merchant: merchants, connection: connections })
    .from(merchants)
    .innerJoin(connections, eq(connections.merchantId, merchants.id))
    .where(
      and(
        eq(merchants.status, "ACTIVE"),
        eq(connections.status, "CONNECTED"),
        isNull(merchants.purgeAfter),
      ),
    );
  for (const { merchant, connection } of eligible)
    if (
      connection.scopes.includes(SEARCH_SCOPE) &&
      (!connection.lastReconciledAt ||
        +connection.lastReconciledAt <
          Date.now() - getEnv().RECONCILE_INTERVAL_HOURS * 3600000)
    )
      await startBackfill(merchant.id, undefined, "RECONCILE");
  const waiting = await getDb()
    .select()
    .from(backfillRuns)
    .where(
      or(
        eq(backfillRuns.status, "QUEUED"),
        and(
          eq(backfillRuns.status, "RUNNING"),
          lt(backfillRuns.heartbeatAt, new Date(Date.now() - 90000)),
        ),
      ),
    )
    .orderBy(backfillRuns.windowTo)
    .limit(10);
  let done = 0;
  for (const run of waiting) {
    if (Date.now() > deadline - 5000) break;
    if ((await runBackfill(run.id, deadline)).done) done++;
  }
  return done;
}
// Workflow and cron share the same checkpoint, tenant lock and lease. A worker
// never steals an active import from the fallback sweep.
export async function reconcileMerchant(
  merchantId: string,
  deadline = Date.now() + 840000,
) {
  const [row] = await getDb()
    .select({ merchant: merchants, connection: connections })
    .from(merchants)
    .innerJoin(connections, eq(connections.merchantId, merchants.id))
    .where(
      and(
        eq(merchants.id, merchantId),
        eq(merchants.status, "ACTIVE"),
        eq(connections.status, "CONNECTED"),
        isNull(merchants.purgeAfter),
      ),
    );
  if (!row || !row.connection.scopes.includes(SEARCH_SCOPE))
    return { skipped: true };
  const run = await startBackfill(merchantId, undefined, "RECONCILE");
  if (run.status === "FAILED")
    throw new Error("Reconciliation needs attention");
  if (run.status === "DONE") return { done: true };
  const result = await runBackfill(run.id, deadline);
  if ("error" in result)
    throw new Error("Reconciliation failed; see merchant history status");
  if (!result.claimed) return { busy: true };
  if (!result.done)
    throw new Error("Reconciliation checkpoint saved; retry required");
  return { done: true };
}
