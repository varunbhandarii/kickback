"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { memberMerchant, requireUser } from "@/lib/dal";
import { requireFormMerchant } from "@/lib/merchant-form";
import {
  disconnectMerchant,
  setRewardsPaused,
  setStaff,
  ProtectedDemoTenant,
} from "@/lib/merchant-actions";
import { saveBusiness } from "@/lib/onboarding";
export async function selectBusiness(form: FormData) {
  const user = await requireUser(),
    id = String(form.get("merchant"));
  if (!(await memberMerchant(user.id, id, ["OWNER", "VIEWER"])))
    throw new Error("Business access denied");
  (await cookies()).set("kickback.merchant", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(getEnv().APP_URL).protocol === "https:",
    path: "/",
  });
  redirect("/m");
}
export async function toggleRewards(form: FormData) {
  const { user, merchant } = await requireFormMerchant(form);
  await setRewardsPaused(user.id, merchant.id, form.get("paused") === "yes");
  revalidatePath("/m");
}
export async function dismissIdea(form: FormData) {
  const { merchant } = await requireFormMerchant(form),
    { getDb } = await import("@/db"),
    { suggestions } = await import("@/db/schema"),
    { and, eq } = await import("drizzle-orm");
  await getDb()
    .update(suggestions)
    .set({ status: "DISMISSED" })
    .where(
      and(
        eq(suggestions.merchantId, merchant.id),
        eq(suggestions.id, String(form.get("id"))),
        eq(suggestions.status, "PENDING"),
      ),
    );
  revalidatePath("/m");
}
export async function dismissNotice(form: FormData) {
  const { merchant } = await requireFormMerchant(form),
    { getDb } = await import("@/db"),
    { notices } = await import("@/db/schema"),
    { and, eq } = await import("drizzle-orm");
  await getDb()
    .update(notices)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notices.merchantId, merchant.id),
        eq(notices.id, String(form.get("id"))),
      ),
    );
  revalidatePath("/m");
}
export async function staffAction(form: FormData) {
  const { user, merchant } = await requireFormMerchant(form);
  await setStaff(
    user.id,
    merchant.id,
    String(form.get("customer")),
    form.get("excluded") === "yes",
  );
  revalidatePath("/m/customers");
}
export async function disconnectAction(
  _state: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const { user, merchant } = await requireFormMerchant(form);
  if (form.get("confirm") !== "DISCONNECT")
    return { error: "Type DISCONNECT to confirm." };
  try {
    await disconnectMerchant(user.id, merchant.id);
  } catch (e) {
    if (e instanceof ProtectedDemoTenant)
      return {
        error:
          "This demo business stays connected. Pause rewards instead if you need to stop payouts.",
      };
    throw e;
  }
  revalidatePath("/m");
  redirect("/m/settings?disconnected=1");
}
export async function updateBusiness(
  _state: { error?: string; message?: string },
  form: FormData,
): Promise<{ error?: string; message?: string }> {
  const { user, merchant } = await requireFormMerchant(form);
  try {
    await saveBusiness(
      user.id,
      {
        displayName: form.get("displayName"),
        slug: form.get("slug"),
        tz: form.get("tz"),
        category: form.get("category"),
      },
      merchant.id,
    );
  } catch {
    return {
      error:
        "Check the business name, unique pay link, and IANA time zone. Downloaded pay links cannot be changed.",
    };
  }
  revalidatePath("/m");
  return { message: "Business settings saved." };
}
