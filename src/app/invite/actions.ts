"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getEnv } from "@/lib/env";
import { acceptOwnerInvite } from "@/lib/team";
export async function acceptInvite(
  _state: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const user = await requireUser(),
    merchantId = String(form.get("merchant"));
  try {
    await acceptOwnerInvite(user.id, merchantId, String(form.get("token")));
  } catch {
    return {
      error:
        "Invitation invalid or expired. Sign in with the invited email and verify it first.",
    };
  }
  (await cookies()).set("kickback.merchant", merchantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(getEnv().APP_URL).protocol === "https:",
    path: "/",
  });
  redirect("/m");
}
