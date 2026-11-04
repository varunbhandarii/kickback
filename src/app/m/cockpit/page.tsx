import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { cockpitStates, visits } from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
import { loadMerchant } from "@/lib/merchants";
import { aiBlocker } from "@/lib/ai/client";
import { getEnv } from "@/lib/env";
import { validateState } from "@/lib/studio/state";
import { ruleInWords } from "@/lib/studio/context";
import CockpitClient from "./cockpit-client";
import { localDay } from "@/lib/engine/evaluate";
import { measurementSentence } from "@/lib/studio/cohorts";
import Link from "next/link";
import { State } from "@/components/ui";
export const metadata = { title: "Cockpit" };
export default async function CockpitPage() {
  const { merchant } = await requireMerchant(),
    loaded = await loadMerchant(merchant.slug, true);
  if (!loaded)
    return (
      <div className="card" style={{ margin: 24 }}>
        <State
          icon="cockpit"
          title="Finish setup to open the Cockpit"
          action={
            <Link href="/m/onboarding" className="btn btn-primary">
              Continue setup
            </Link>
          }
        >
          <p>The Cockpit shows your program once it has a rule and some history.</p>
        </State>
      </div>
    );
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
      // A saved layout keeps its pages; the Cockpit always opens on Loyalty.
      state = { ...validateState(saved.state), selectedPageId: "loyalty" };
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
        measurement: await measurementSentence(merchant.id),
      }}
      initialState={state}
      invalidState={invalid}
      aiOff={(await aiBlocker(merchant)) ?? undefined}
    />
  );
}
