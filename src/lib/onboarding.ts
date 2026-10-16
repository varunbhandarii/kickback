import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  backfillRuns,
  merchants,
  merchantUsers,
  programs,
  connections,
  customers,
  designRuns,
  suggestions,
} from "@/db/schema";
import { audit } from "./audit";
import {
  businessSchema,
  defaultMenu,
  menuSchema,
  preset,
} from "./merchant-inputs";
import { loadProgram, rewardNote, type ProgramSpec } from "./engine/program";
import { enqueue } from "./rewards/enqueue";
import { storedDesign, specEdits } from "./ai/service";
import {
  candidateFromSpec,
  candidateSpec,
  validateCandidates,
} from "./ai/designer";
import { designData } from "./ai/designer/context";
import { simulate, metricsAcceptable } from "./engine/simulate";
import { validateScribeSpec } from "./ai/scribe";
import { lockMerchant } from "./ledger/locks";
async function ownership(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  userId: string,
  merchantId: string,
) {
  const [membership] = await tx
    .select()
    .from(merchantUsers)
    .where(
      and(
        eq(merchantUsers.userId, userId),
        eq(merchantUsers.merchantId, merchantId),
        eq(merchantUsers.role, "OWNER"),
      ),
    );
  if (!membership) throw new Error("Business access denied");
}
export async function saveBusiness(
  userId: string,
  input: unknown,
  merchantId?: string,
) {
  const fields = businessSchema.parse(input);
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`owner:${userId}`}))`,
    );
    if (merchantId) {
      await ownership(tx, userId, merchantId);
      await lockMerchant(tx, merchantId);
      const [current] = await tx
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId));
      if (current.slugLocked && current.slug !== fields.slug)
        throw new Error("Your printed pay link is locked");
      const [updated] = await tx
        .update(merchants)
        .set({
          ...fields,
          onboardingStep:
            current.onboardingStep === "business"
              ? "connect"
              : current.onboardingStep,
        })
        .where(eq(merchants.id, merchantId))
        .returning();
      return updated;
    }
    const [existing] = await tx
      .select()
      .from(merchantUsers)
      .where(eq(merchantUsers.userId, userId));
    if (existing) throw new Error("This account already has a business");
    const [merchant] = await tx
      .insert(merchants)
      .values({
        ...fields,
        id: randomUUID(),
        status: "ONBOARDING",
        onboardingStep: "connect",
        menu: defaultMenu(fields.category),
      })
      .returning();
    await tx
      .insert(merchantUsers)
      .values({ userId, merchantId: merchant.id, role: "OWNER" });
    await tx.insert(programs).values({
      merchantId: merchant.id,
      version: 1,
      status: "DRAFT",
      spec: preset(fields.category),
      provenance: { source: "preset", category: fields.category },
    });
    await audit(tx, merchant.id, "merchant.created", merchant.id, {
      category: fields.category,
    });
    return merchant;
  });
}
export async function activateProgram(
  userId: string,
  merchantId: string,
  input: unknown,
  approval?: {
    designRunId?: string;
    candidateId?: string;
    scribeRunId?: string;
    liftAssumptionPct?: number;
  },
) {
  const spec = loadProgram(input);
  return getDb().transaction(async (tx) => {
    await ownership(tx, userId, merchantId);
    await lockMerchant(tx, merchantId);
    const [connection] = await tx
      .select()
      .from(connections)
      .where(eq(connections.merchantId, merchantId));
    if (connection?.status !== "CONNECTED")
      throw new Error("Connect your PayPal business before activating");
    const [merchant] = await tx
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchantId));
    if (merchant.purgeAfter)
      throw new Error("Reconnect your business before activating");
    const [importing] = await tx
      .select()
      .from(backfillRuns)
      .where(
        and(
          eq(backfillRuns.merchantId, merchantId),
          eq(backfillRuns.kind, "BACKFILL"),
          inArray(backfillRuns.status, ["QUEUED", "RUNNING"]),
        ),
      );
    if (importing)
      throw new Error("Wait for history to finish before activating");
    if (spec.winBack && !spec.welcomeBackNote)
      spec.welcomeBackNote = `Welcome back to ${merchant.displayName}. A loyalty reward to thank you!`;
    rewardNote(spec, merchant.displayName);
    validateScribeSpec(
      spec,
      merchant.displayName,
      merchant.menu.map((i) => i.name),
    );
    let provenance: Record<string, unknown> = {
      source: "preset",
      category: merchant.category,
      approvedBy: userId,
      approvedAt: new Date().toISOString(),
    };
    if (approval?.designRunId) {
      if (
        approval.liftAssumptionPct !== undefined &&
        (!Number.isFinite(approval.liftAssumptionPct) ||
          approval.liftAssumptionPct < 3 ||
          approval.liftAssumptionPct > 10)
      )
        throw new Error("INVALID_LIFT_ASSUMPTION");
      const design = await storedDesign(tx, merchantId, approval.designRunId),
        selected = design.cards.find(
          (c) => c.params.id === approval.candidateId,
        );
      if (!selected || !selected.acceptable)
        throw new Error("CANDIDATE_NOT_ACCEPTABLE");
      const edited = candidateFromSpec(
        spec,
        selected.params.id,
        selected.params.who_it_favors,
      );
      validateCandidates(
        {
          candidates: design.cards.map((c) =>
            c.params.id === edited.id ? edited : c.params,
          ),
        },
        { ...design, budgetCents: design.input.budgetCents },
      );
      const [current] = await tx
        .select()
        .from(programs)
        .where(
          and(
            eq(programs.merchantId, merchantId),
            eq(programs.status, "ACTIVE"),
          ),
        );
      const data = await designData(
        {
          ...merchant,
          program: current ?? {
            id: "",
            merchantId,
            version: 0,
            spec,
            status: "DRAFT",
            effectiveFrom: new Date(),
            retiredAt: null,
            provenance: {},
          },
          spec,
        },
        design.input,
        new Date(),
        tx,
      );
      const metrics = simulate(spec, data.rows, merchant.tz, {
        windowStart: new Date(data.context.windowStart),
        windowEnd: new Date(data.context.windowEnd),
        marginPct: design.input.marginPct,
      });
      if (!metricsAcceptable(metrics))
        throw new Error("EDITED_SIMULATION_REJECTED");
      provenance = {
        ...provenance,
        source: "designer",
        designRunId: approval.designRunId,
        goal: design.input.goal,
        budgetCents: design.input.budgetCents,
        marginPct: design.input.marginPct,
        liftAssumptionPct:
          approval.liftAssumptionPct ?? design.input.liftAssumptionPct,
        candidateId: selected.params.id,
        candidates: design.cards,
        model: design.model,
        promptVersion: design.promptVersion,
        aiCallIds: design.aiCallIds,
        chosenEdits: specEdits(candidateSpec(selected.params), spec),
        selectedMetrics: metrics,
        includesDemoHistory: design.includesDemoHistory,
        demoShare: design.demoShare,
      };
    }
    if (approval?.scribeRunId) {
      const [draft] = await tx
        .select()
        .from(designRuns)
        .where(
          and(
            eq(designRuns.id, approval.scribeRunId),
            eq(designRuns.merchantId, merchantId),
          ),
        );
      if (
        !draft ||
        draft.expiresAt < new Date() ||
        (draft.result as { kind?: string }).kind !== "scribe"
      )
        throw new Error("SCRIBE_EXPIRED");
      provenance.scribe = {
        draftId: draft.id,
        aiCallIds: (draft.result as { generated: { aiCallIds: string[] } })
          .generated.aiCallIds,
        approvedBy: userId,
        approvedAt: new Date().toISOString(),
      };
    }
    if (approval?.designRunId)
      await tx
        .update(suggestions)
        .set({ status: "APPROVED" })
        .where(
          and(
            eq(suggestions.merchantId, merchantId),
            eq(suggestions.designRunId, approval.designRunId),
            eq(suggestions.status, "PENDING"),
          ),
        );
    const previous = await tx
      .select()
      .from(programs)
      .where(eq(programs.merchantId, merchantId))
      .orderBy(desc(programs.version));
    const draft = previous.find((row) => row.status === "DRAFT");
    await tx
      .update(programs)
      .set({ status: "RETIRED", retiredAt: new Date() })
      .where(
        and(eq(programs.merchantId, merchantId), eq(programs.status, "ACTIVE")),
      );
    if (draft)
      await tx
        .update(programs)
        .set({
          spec,
          status: "ACTIVE",
          effectiveFrom: new Date(),
          provenance,
        })
        .where(eq(programs.id, draft.id));
    else
      await tx.insert(programs).values({
        merchantId,
        version: (previous[0]?.version ?? 0) + 1,
        spec,
        status: "ACTIVE",
        effectiveFrom: new Date(),
        provenance,
      });
    await tx
      .update(merchants)
      .set({ status: "ACTIVE", rewardsPaused: false, onboardingStep: "menu" })
      .where(eq(merchants.id, merchantId));
    const [active] = await tx
        .select()
        .from(programs)
        .where(
          and(
            eq(programs.merchantId, merchantId),
            eq(programs.status, "ACTIVE"),
          ),
        ),
      people = await tx
        .select()
        .from(customers)
        .where(eq(customers.merchantId, merchantId));
    for (const person of people)
      await enqueue(
        tx,
        { ...merchant, status: "ACTIVE", program: active, spec },
        person.key,
      );
    await audit(tx, merchantId, "program.activated", merchantId, {
      type: (spec as ProgramSpec).type,
    });
  });
}
export async function saveMenu(
  userId: string,
  merchantId: string,
  input: unknown,
  finish = false,
) {
  const menu = menuSchema.parse(input);
  await getDb().transaction(async (tx) => {
    await ownership(tx, userId, merchantId);
    await tx
      .update(merchants)
      .set({ menu, ...(finish ? { onboardingStep: "done" } : {}) })
      .where(eq(merchants.id, merchantId));
    await audit(tx, merchantId, "merchant.menu_updated", merchantId, {
      items: menu.length,
    });
  });
}
export async function lockSlug(userId: string, merchantId: string) {
  await getDb().transaction(async (tx) => {
    await ownership(tx, userId, merchantId);
    await tx
      .update(merchants)
      .set({ slugLocked: true })
      .where(eq(merchants.id, merchantId));
  });
}
