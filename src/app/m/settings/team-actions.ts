"use server";
import { revalidatePath } from "next/cache";
import { requireFormMerchant } from "@/lib/merchant-form";
import { inviteOwner, removeOwner } from "@/lib/team";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/dal";
import { deleteMerchantAccount } from "@/lib/account-deletion";
export async function sendInvite(
  _state: { error?: string; message?: string },
  form: FormData,
): Promise<{ error?: string; message?: string }> {
  const { user, merchant } = await requireFormMerchant(form);
  if (form.get("confirmAccess") !== "on")
    return {
      error: "Confirm that this person may manage the business and refunds.",
    };
  try {
    await inviteOwner(user.id, merchant.id, form.get("email"));
  } catch {
    return {
      error:
        "Verify your email, check the recipient, and confirm email delivery is configured. Invitations are limited to 20 pending per business.",
    };
  }
  return { message: "Invitation sent. It expires in seven days." };
}
export async function revokeOwner(form: FormData) {
  const { user, merchant } = await requireFormMerchant(form);
  await removeOwner(user.id, merchant.id, String(form.get("owner")));
  revalidatePath("/m/settings");
}
export async function deleteAccount(
  _state: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (form.get("confirm") !== "DELETE MY ACCOUNT")
    return { error: "Type DELETE MY ACCOUNT to confirm." };
  try {
    await deleteMerchantAccount(
      session.user.id,
      String(form.get("password") ?? ""),
      session.session.createdAt,
    );
  } catch {
    return {
      error:
        "Sign in again, confirm your current password if you use one, and retry. The seeded demo account cannot be deleted.",
    };
  }
  (await cookies()).delete("kickback.merchant");
  redirect("/sign-in?deleted=1");
}
