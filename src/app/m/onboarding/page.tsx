export const metadata = { title: "Business setup" };
import { redirect } from "next/navigation";
import { requireOwnerMerchant } from "@/lib/dal";
export default async function Onboarding() {
  const { merchant } = await requireOwnerMerchant();
  redirect(
    merchant.onboardingStep === "done"
      ? "/m"
      : `/m/onboarding/${merchant.onboardingStep}`,
  );
}
