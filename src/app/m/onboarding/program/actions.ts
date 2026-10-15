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
    await activateProgram(
      user.id,
      merchant.id,
      {
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
        ...(type === "VISIT_MILESTONE"
          ? { endowedProgress: Number(form.get("endowedProgress") ?? 0) }
          : {}),
        noteVariants: String(form.get("noteVariants") ?? "")
          .split("\n")
          .map((n) => n.trim())
          .filter(Boolean),
        termsIntro: String(form.get("termsIntro") ?? "") || undefined,
        workedExamples: JSON.parse(String(form.get("workedExamples") ?? "[]")),
        signPitch: String(form.get("signPitch") ?? "") || undefined,
        winBack:
          form.get("winBack") === "on"
            ? {
                gapDays: Number(form.get("winBackGap")),
                rewardCents: dollarsToCents(String(form.get("winBackReward"))),
                minVisits: Number(form.get("winBackMin")),
              }
            : undefined,
      },
      {
        designRunId: String(form.get("designRunId") ?? "") || undefined,
        candidateId: String(form.get("candidateId") ?? "") || undefined,
        scribeRunId: String(form.get("scribeRunId") ?? "") || undefined,
        liftAssumptionPct: Number(form.get("approvedLift") ?? 5),
      },
    );
  } catch {
    return {
      error:
        "Check your program amounts and limits, and confirm PayPal is connected before activating.",
    };
  }
  redirect("/m/onboarding/menu");
}
