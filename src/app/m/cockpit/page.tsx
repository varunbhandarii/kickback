import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { cockpitStates, visits } from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
import { loadMerchant } from "@/lib/merchants";
import { aiEnabled } from "@/lib/ai/client";
import { getEnv } from "@/lib/env";
import { validateState } from "@/lib/studio/state";
import { ruleInWords } from "@/lib/studio/context";
import CockpitClient from "./cockpit-client";
import { localDay } from "@/lib/engine/evaluate";
export default async function CockpitPage() {
  const { merchant } = await requireMerchant(),
    loaded = await loadMerchant(merchant.slug, true);
  if (!loaded) return <p>Finish business setup to open the cockpit.</p>;
  const [[saved], [demo]] = await Promise.all([
    getDb()
      .select()
      .from(cockpitStates)
      .where(eq(cockpitStates.merchantId, merchant.id)),
    getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(visits)
      .where(
        and(
          eq(visits.merchantId, merchant.id),
          sql`${visits.source} in ('FIXTURE','REPLAY')`,
        ),
      ),
  ]);
  let state: unknown,
    invalid = false;
  if (saved)
    try {
      state = validateState(saved.state);
    } catch {
      invalid = true;
    }
  return (
    <CockpitClient
      context={{
        asOfDay: localDay(new Date(), merchant.tz),
        name: merchant.displayName,
        tz: merchant.tz,
        rule: ruleInWords(loaded.spec),
        spec: loaded.spec,
        demo: demo.n > 0,
        model: getEnv().ANTHROPIC_MODEL,
      }}
      initialState={state}
      invalidState={invalid}
      ai={aiEnabled()}
    />
  );
}
