import { task } from "@renderinc/sdk/workflows";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../src/db/index";
import { merchants, connections } from "../src/db/schema";
import { reconcileMerchant as reconcile } from "../src/lib/history/worker";
import { weeklyDigests } from "../src/lib/digests";
import { SEARCH_SCOPE } from "../src/lib/connections";
import { beat } from "../src/lib/heartbeat";
const retry = { maxRetries: 2, waitDurationMs: 10000, backoffScaling: 2 };
export const reconcileMerchant = task(
  { name: "reconcileMerchant", timeoutSeconds: 900, retry, plan: "flex" },
  async (_ctx, id: string) =>
    reconcile(z.uuid().parse(id), Date.now() + 840000),
);
export const nightlyReconcile = task(
  { name: "nightlyReconcile", timeoutSeconds: 3600, retry, plan: "flex" },
  async (ctx) => {
    const rows = await getDb()
      .select({ id: merchants.id, scopes: connections.scopes })
      .from(merchants)
      .innerJoin(connections, eq(connections.merchantId, merchants.id))
      .where(
        and(
          eq(merchants.status, "ACTIVE"),
          eq(connections.status, "CONNECTED"),
          isNull(merchants.purgeAfter),
        ),
      );
    const ids = rows
      .filter((r) => r.scopes.includes(SEARCH_SCOPE))
      .map((r) => r.id);
    let failed = 0;
    // Bound fan-out to respect task-start limits as a workspace grows.
    for (let i = 0; i < ids.length; i += 20) {
      const results = await Promise.allSettled(
        ids.slice(i, i + 20).map((id) => ctx.run(reconcileMerchant, id)),
      );
      failed += results.filter((r) => r.status === "rejected").length;
    }
    console.info(
      JSON.stringify({
        action: "nightly_reconcile",
        merchants: ids.length,
        failed,
      }),
    );
    if (!failed)
      await beat("reconcile", process.env.BETTERSTACK_RECONCILE_HEARTBEAT_URL || undefined);
    return { merchants: ids.length, failed };
  },
);
export const weeklyDigest = task(
  { name: "weeklyDigest", timeoutSeconds: 900, retry, plan: "flex" },
  async (_ctx, weekIso: string) => {
    const time = z.iso.datetime().parse(weekIso);
    return {
      created: await weeklyDigests(Date.now() + 840000, new Date(time)),
    };
  },
);
