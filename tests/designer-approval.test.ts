import { randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { designRuns, merchantUsers, programs, user } from "@/db/schema";
import { createDesign } from "@/lib/ai/service";
import { activateProgram } from "@/lib/onboarding";
import { candidateSpec } from "@/lib/ai/designer";
import { executeAnalystTool, analystToolDefinitions } from "@/lib/ai/tools";
import { fixture, resetDb, setupDb, teardownDb } from "./helpers/db";
describe("stored design approval and analyst scope", () => {
  beforeAll(setupDb);
  beforeEach(async () => {
    await resetDb();
    vi.stubEnv("AI_ENABLED", "false");
  });
  afterAll(teardownDb);
  async function owner(merchantId: string) {
    const id = randomUUID();
    await getDb()
      .insert(user)
      .values({ id, name: "Owner", email: id + "@example.com" });
    await getDb().insert(merchantUsers).values({ merchantId, userId: id });
    return id;
  }
  const input = {
    goal: "Thank my returning customers",
    budgetCents: 15000,
    marginPct: 60,
    liftAssumptionPct: 5,
  };
  it("loads metrics from an owned draft and records edits, approver and full provenance", async () => {
    const merchant = await fixture(),
      actor = await owner(merchant.id),
      design = await createDesign(merchant.id, input, actor),
      choice = design.cards[0],
      spec = { ...candidateSpec(choice.params), mergeWindowMin: 180 };
    await activateProgram(actor, merchant.id, spec, {
      designRunId: design.id,
      candidateId: choice.params.id,
    });
    const active = (
      await getDb()
        .select()
        .from(programs)
        .where(eq(programs.merchantId, merchant.id))
    ).find((p) => p.status === "ACTIVE")!;
    expect(active.provenance).toMatchObject({
      source: "designer",
      approvedBy: actor,
      candidateId: "A",
      goal: input.goal,
      chosenEdits: { mergeWindowMin: { from: 120, to: 180 } },
    });
    expect(
      (active.provenance as { candidates: unknown[] }).candidates,
    ).toHaveLength(3);
  });
  it("rejects another tenant's draft, expired drafts, and edited rules outside ceilings", async () => {
    const merchant = await fixture(),
      actor = await owner(merchant.id),
      design = await createDesign(merchant.id, input, actor),
      choice = design.cards[0],
      other = await fixture(undefined, "other"),
      otherOwner = await owner(other.id);
    await expect(
      activateProgram(otherOwner, other.id, candidateSpec(choice.params), {
        designRunId: design.id,
        candidateId: "A",
      }),
    ).rejects.toThrow("EXPIRED");
    await expect(
      activateProgram(
        actor,
        merchant.id,
        { ...candidateSpec(choice.params), monthlyBudgetCents: 16000 },
        { designRunId: design.id, candidateId: "A" },
      ),
    ).rejects.toThrow("budget");
    await getDb()
      .update(designRuns)
      .set({ expiresAt: new Date(0) })
      .where(eq(designRuns.id, design.id));
    await expect(
      activateProgram(actor, merchant.id, candidateSpec(choice.params), {
        designRunId: design.id,
        candidateId: "A",
      }),
    ).rejects.toThrow("EXPIRED");
  });
  it("provides strict JSON schemas and rejects analyst cross-tenant access", async () => {
    const merchant = await fixture(),
      actor = await owner(merchant.id),
      other = await fixture(undefined, "other");
    expect(analystToolDefinitions).toHaveLength(5);
    expect(
      analystToolDefinitions.every(
        (t) =>
          t.strict &&
          (t.input_schema as { additionalProperties: boolean })
            .additionalProperties === false,
      ),
    ).toBe(true);
    await expect(
      executeAnalystTool(
        "program_metrics",
        { merchantId: other.id, days: 30 },
        { userId: actor, merchantId: merchant.id },
      ),
    ).rejects.toThrow("TENANT_MISMATCH");
    expect(
      await executeAnalystTool(
        "program_metrics",
        { merchantId: merchant.id, days: 30 },
        { userId: actor, merchantId: merchant.id },
      ),
    ).toMatchObject({ rewardsPaid: 0, revenueCents: 0 });
    await expect(
      executeAnalystTool(
        "design_program",
        { merchantId: merchant.id, ...input },
        { userId: actor, merchantId: merchant.id },
      ),
    ).resolves.toMatchObject({ fallback: true });
    expect(await getDb().select().from(programs)).toHaveLength(2);
  });
});
