"use server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cockpitStates } from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
import { validateState } from "@/lib/studio/state";
import { audit } from "@/lib/audit";
export async function saveCockpitState(state: unknown) {
  const { user, merchant, role } = await requireMerchant();
  // Read-only demo layouts stay in the visitor's browser.
  if (role !== "OWNER") return;
  if (merchant.purgeAfter || merchant.status === "DISCONNECTED")
    throw new Error("Business unavailable");
  const valid = validateState(state);
  await getDb().transaction(async (tx) => {
    await tx
      .insert(cockpitStates)
      .values({
        merchantId: merchant.id,
        state: valid,
        studioVersion: valid.version ?? "3.0.0",
        updatedBy: user.id,
      })
      .onConflictDoUpdate({
        target: cockpitStates.merchantId,
        set: {
          state: valid,
          studioVersion: valid.version ?? "3.0.0",
          updatedAt: new Date(),
          updatedBy: user.id,
        },
      });
    await audit(tx, merchant.id, "cockpit.state_saved", "layout", {}, user.id);
  });
}
export async function resetCockpitState() {
  const { user, merchant, role } = await requireMerchant();
  if (role !== "OWNER") return;
  await getDb().transaction(async (tx) => {
    await tx
      .delete(cockpitStates)
      .where(eq(cockpitStates.merchantId, merchant.id));
    await audit(tx, merchant.id, "cockpit.state_reset", "layout", {}, user.id);
  });
}
