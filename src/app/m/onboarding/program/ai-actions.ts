"use server";
import { requireFormMerchant } from "@/lib/merchant-form";
import { createDesign, createScribe } from "@/lib/ai/service";
import { dollarsToCents } from "@/lib/merchant-inputs";
import { revalidatePath } from "next/cache";
export async function proposeDesign(form: FormData) {
  const { user, merchant } = await requireFormMerchant(form);
  try {
    return {
      result: await createDesign(
        merchant.id,
        {
          goal: String(form.get("goal")),
          budgetCents: dollarsToCents(String(form.get("budget"))),
          marginPct: Number(form.get("margin")),
          liftAssumptionPct: Number(form.get("lift")),
        },
        user.id,
      ),
    };
  } catch {
    return {
      error:
        "Design is unavailable. Check your goal and budget, or use a manual preset.",
    };
  }
}
export async function writeCopy(form: FormData) {
  const { user, merchant } = await requireFormMerchant(form);
  try {
    return {
      result: await createScribe(
        merchant.id,
        JSON.parse(String(form.get("spec"))),
        user.id,
      ),
    };
  } catch {
    return {
      error:
        "Copy could not be validated. Use the template or adjust the program.",
    };
  }
}
export async function saveVoice(form: FormData) {
  const { user, merchant } = await requireFormMerchant(form),
    hints = String(form.get("voiceHints") ?? "").trim();
  if (hints.length > 200 || /[\r\n]/.test(hints)) return;
  const { getDb } = await import("@/db"),
    { merchants } = await import("@/db/schema"),
    { eq } = await import("drizzle-orm"),
    { audit } = await import("@/lib/audit");
  await getDb().transaction(async (tx) => {
    await tx
      .update(merchants)
      .set({ voiceHints: hints })
      .where(eq(merchants.id, merchant.id));
    await audit(tx, merchant.id, "voice.updated", merchant.id, {}, user.id);
  });
  revalidatePath("/m/settings");
}
