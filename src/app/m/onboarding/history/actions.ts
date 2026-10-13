"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants } from "@/db/schema";
import { requireFormMerchant } from "@/lib/merchant-form";
import { runBackfill, startBackfill } from "@/lib/history/worker";
export async function importHistory(
  _state: { error?: string; started?: boolean; runId?: string },
  form: FormData,
): Promise<{ error?: string; started?: boolean; runId?: string }> {
  void _state;
  const { user, merchant } = await requireFormMerchant(form);
  try {
    const run = await startBackfill(merchant.id, user.id, "BACKFILL", true);
    after(() => runBackfill(run.id).then(() => undefined));
    return { started: true, runId: run.id };
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message === "HISTORY_BUSY"
          ? "Reconciliation is already running. Wait a moment, then start your 90-day history import."
          : "History could not start. Confirm your connection and enable Transaction Search on your PayPal app, then try again.",
    };
  }
}
export async function continueHistory(form: FormData) {
  const { merchant } = await requireFormMerchant(form);
  await getDb()
    .update(merchants)
    .set({ onboardingStep: "program" })
    .where(eq(merchants.id, merchant.id));
  redirect("/m/onboarding/program");
}
