import { redirect } from "next/navigation";
import { requireMerchant } from "@/lib/dal";
export default async function Onboarding() {
  const { merchant } = await requireMerchant();
  redirect(
    merchant.onboardingStep === "done"
      ? "/m"
      : `/m/onboarding/${merchant.onboardingStep}`,
  );
}
