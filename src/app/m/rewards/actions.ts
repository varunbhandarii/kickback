"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireFormMerchant } from "@/lib/merchant-form";
import { decideReview } from "@/lib/guard/review";
import { explainFlag } from "@/lib/guard/explain";
import { settleReward } from "@/lib/rewards/executor";
export async function reviewReward(
  _state: { error?: string; message?: string },
  form: FormData,
): Promise<{ error?: string; message?: string }> {
  const { user, merchant } = await requireFormMerchant(form),
    rewardId = String(form.get("rewardId")),
    decision = String(form.get("decision"));
  if (
    !/^[0-9a-f-]{36}$/.test(rewardId) ||
    !["APPROVED", "DECLINED"].includes(decision)
  )
    return { error: "Invalid review request." };
  try {
    await decideReview(
      merchant.id,
      rewardId,
      decision as "APPROVED" | "DECLINED",
      user.id,
    );
    if (decision === "APPROVED")
      after(async () => {
        await settleReward(rewardId).catch(() => undefined);
      });
    revalidatePath("/m/rewards");
    revalidatePath("/m");
    return {
      message:
        decision === "APPROVED"
          ? "Approved. The refund will use the normal eligibility checks."
          : "Declined. This reward cycle stays consumed.",
    };
  } catch {
    return {
      error:
        "This reward cannot be reviewed now. Check its status and customer eligibility.",
    };
  }
}
export async function explainReview(form: FormData) {
  const { merchant } = await requireFormMerchant(form);
  await explainFlag(merchant.id, String(form.get("rewardId")));
  revalidatePath("/m/rewards");
}
