import { z } from "zod";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, guardFlags, merchants, rewards, visits } from "@/db/schema";
import { programSchema, loadProgram } from "../engine/program";
import { simulate, quantile } from "../engine/simulate";
import { loadMerchant } from "../merchants";
import { assertOwner } from "./service";
import { designData, prior } from "./designer/context";
import { designInputSchema, designPipeline } from "./designer/pipeline";
import { programMetrics } from "../guard/notices";
const tenant = { merchantId: z.uuid() },
  days = z.number().int().min(1).max(90);
export const toolSchemas = {
  simulate_rules: z.strictObject({ ...tenant, spec: programSchema }),
  explain_customer: z.strictObject({
    ...tenant,
    customerKey: z.string().min(1).max(80),
  }),
  flag_abuse: z.strictObject({ ...tenant, days }),
  program_metrics: z.strictObject({ ...tenant, days }),
  design_program: z.strictObject({ ...tenant, ...designInputSchema.shape }),
};
export const analystToolDefinitions = Object.entries(toolSchemas).map(
  ([name, schema]) => ({
    name,
    description: "Read-only, merchant-scoped " + name.replaceAll("_", " "),
    strict: true,
    input_schema: z.toJSONSchema(schema),
  }),
);
export async function executeAnalystTool(
  name: keyof typeof toolSchemas,
  input: unknown,
  actor: { userId: string; merchantId: string },
) {
  const parsed = toolSchemas[name].parse(input);
  if (parsed.merchantId !== actor.merchantId)
    throw new Error("TENANT_MISMATCH");
  await assertOwner(actor.userId, actor.merchantId);
  const [business] = await getDb()
      .select()
      .from(merchants)
      .where(eq(merchants.id, actor.merchantId)),
    merchant = await loadMerchant(business.slug, true);
  if (!merchant || business.purgeAfter) throw new Error("BUSINESS_UNAVAILABLE");
  if (name === "program_metrics")
    return programMetrics(
      actor.merchantId,
      (parsed as z.infer<typeof toolSchemas.program_metrics>).days,
    );
  if (name === "flag_abuse") {
    const p = parsed as z.infer<typeof toolSchemas.flag_abuse>;
    return getDb()
      .select({
        score: guardFlags.score,
        tier: guardFlags.tier,
        reasons: guardFlags.reasons,
        decision: guardFlags.decision,
        createdAt: guardFlags.createdAt,
      })
      .from(guardFlags)
      .where(
        and(
          eq(guardFlags.merchantId, actor.merchantId),
          gte(guardFlags.createdAt, new Date(Date.now() - p.days * 86400000)),
        ),
      );
  }
  if (name === "explain_customer") {
    const p = parsed as z.infer<typeof toolSchemas.explain_customer>;
    const [person] = await getDb()
      .select({ status: customers.status, progress: customers.progress })
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, actor.merchantId),
          eq(customers.key, p.customerKey),
        ),
      );
    if (!person) return { found: false };
    const history = await getDb()
        .select()
        .from(visits)
        .where(
          and(
            eq(visits.merchantId, actor.merchantId),
            eq(visits.customerKey, p.customerKey),
          ),
        )
        .orderBy(visits.startedAt),
      completed = history.filter(
        (v) => v.status === "COMPLETED" && v.source !== "FIXTURE",
      );
    const rows = await getDb()
      .select({ state: rewards.state, score: rewards.guardScore })
      .from(rewards)
      .where(
        and(
          eq(rewards.merchantId, actor.merchantId),
          eq(rewards.customerKey, p.customerKey),
        ),
      );
    return {
      ...person,
      visits: completed.length,
      lastVisit: completed.at(-1)?.startedAt ?? null,
      medianGapDays: quantile(
        completed
          .slice(1)
          .map((v, i) => (+v.startedAt - +completed[i].startedAt) / 86400000),
        0.5,
      ),
      rewardsByState: Object.fromEntries(
        [...new Set(rows.map((r) => r.state))].map((s) => [
          s,
          rows.filter((r) => r.state === s).length,
        ]),
      ),
      flaggedRewards: rows.filter((r) => r.score >= 30).length,
      includesDemoHistory: history.some(
        (v) => v.source === "FIXTURE" || v.source === "REPLAY",
      ),
    };
  }
  const params =
    name === "design_program"
      ? designInputSchema.parse(
          Object.fromEntries(
            Object.entries(parsed).filter(([k]) => k !== "merchantId"),
          ),
        )
      : {
          goal: "Simulate the supplied rule",
          budgetCents: merchant.spec.monthlyBudgetCents,
          marginPct: prior(merchant.category).marginPct,
          liftAssumptionPct: 5,
        };
  const simulationSpec =
    name === "simulate_rules"
      ? loadProgram((parsed as z.infer<typeof toolSchemas.simulate_rules>).spec)
      : merchant.spec;
  const data = await designData({ ...merchant, spec: simulationSpec }, params);
  if (name === "simulate_rules")
    return simulate(simulationSpec, data.rows, merchant.tz, {
      windowStart: new Date(data.context.windowStart),
      windowEnd: new Date(data.context.windowEnd),
      marginPct: params.marginPct,
    });
  return designPipeline(merchant.id, data.context, data.rows, {
    tz: merchant.tz,
  });
}
