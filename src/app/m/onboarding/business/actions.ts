"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, ownedMerchant } from "@/lib/dal";
import { saveBusiness } from "@/lib/onboarding";
import { slugFromName } from "@/lib/merchant-inputs";
import { getEnv } from "@/lib/env";
export type BusinessState = { error?: string };
export async function submitBusiness(
  _state: BusinessState,
  form: FormData,
): Promise<BusinessState> {
  const user = await requireUser(),
    selected = String(form.get("merchantId") ?? "");
  const existing = selected
    ? await ownedMerchant(user.id, selected)
    : undefined;
  if (selected && !existing)
    return { error: "Business access denied. Reload this page." };
  let id: string;
  try {
    const name = String(form.get("displayName") ?? "");
    const merchant = await saveBusiness(
      user.id,
      {
        displayName: name,
        slug: String(form.get("slug") || slugFromName(name)),
        tz: String(form.get("tz") ?? ""),
        category: String(form.get("category") ?? ""),
      },
      existing?.id,
    );
    id = merchant.id;
  } catch {
    return {
      error:
        "Check the business details and choose an available pay-link name. Printed pay links cannot change.",
    };
  }
  (await cookies()).set("kickback.merchant", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(getEnv().APP_URL).protocol === "https:",
    path: "/",
    maxAge: 7 * 86400,
  });
  redirect("/m/onboarding/connect");
}
