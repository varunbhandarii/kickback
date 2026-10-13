"use server";
import { redirect } from "next/navigation";
import { requireFormMerchant } from "@/lib/merchant-form";
import { activateProgram } from "@/lib/onboarding";
import { dollarsToCents, preset } from "@/lib/merchant-inputs";
export async function submitProgram(
  _state: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const { user, merchant } = await requireFormMerchant(form);
  try {
    const base = preset(String(form.get("preset"))),
      type = String(form.get("type"));
    await activateProgram(user.id, merchant.id, {
      ...base,
      type,
      noteTemplate:
        type === "SPEND_MILESTONE"
          ? "Thanks for {n}, this one's on {merchant}"
          : "Thanks for {n} visits, this one's on {merchant}",
      ...(type === "VISIT_MILESTONE"
        ? { n: Number(form.get("n")) }
        : { spendCents: dollarsToCents(String(form.get("spend"))) }),
      rewardCents: dollarsToCents(String(form.get("reward"))),
      minTicketCents: dollarsToCents(String(form.get("minimum"))),
      windowDays: Number(form.get("window")),
      mergeWindowMin: Number(form.get("merge")),
      perCustomerMonthlyCapCents: dollarsToCents(
        String(form.get("customerCap")),
      ),
      dailyBudgetCents: dollarsToCents(String(form.get("daily"))),
      monthlyBudgetCents: dollarsToCents(String(form.get("monthly"))),
      settlement: form.get("settlement"),
    });
  } catch {
    return {
      error:
        "Check your program amounts and limits, and confirm PayPal is connected before activating.",
    };
  }
  redirect("/m/onboarding/menu");
}
