import "server-only";
import { ownedMerchant, requireUser } from "./dal";
import { cookies } from "next/headers";
import { getEnv } from "./env";
export async function requireFormMerchant(form: FormData) {
  const user = await requireUser(),
    id = form.get("merchantId");
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new Error("Business access denied");
  const merchant = await ownedMerchant(user.id, id);
  if (!merchant) throw new Error("Business access denied");
  (await cookies()).set("kickback.merchant", merchant.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(getEnv().APP_URL).protocol === "https:",
    path: "/",
    maxAge: 7 * 86400,
  });
  return { user, merchant };
}
