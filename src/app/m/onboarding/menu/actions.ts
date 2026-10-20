"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireFormMerchant } from "@/lib/merchant-form";
import { lockSlug, saveMenu } from "@/lib/onboarding";
import { dollarsToCents } from "@/lib/merchant-inputs";
export async function submitMenu(
  _state: { error?: string; message?: string },
  form: FormData,
): Promise<{ error?: string; message?: string }> {
  const { user, merchant } = await requireFormMerchant(form);
  try {
    const names = form.getAll("name"),
      prices = form.getAll("price"),
      ids = form.getAll("id");
    await saveMenu(
      user.id,
      merchant.id,
      names.map((name, index) => ({
        id: String(ids[index]),
        name: String(name),
        priceCents: dollarsToCents(String(prices[index])),
      })),
      form.get("finish") === "yes",
    );
  } catch {
    return {
      error:
        "Add 1–12 items with unique IDs, names, and prices between $1 and $500.",
    };
  }
  revalidatePath(`/pay/${merchant.slug}`);
  revalidatePath("/m/sign");
  if (form.get("finish") === "yes") redirect("/m");
  return { message: "Menu saved." };
}
export async function downloadSign(form: FormData) {
  const { user, merchant } = await requireFormMerchant(form);
  await lockSlug(user.id, merchant.id);
  redirect(
    form.get("format") === "qr"
      ? `/api/pay/${merchant.slug}/qr.png?download=1`
      : `/pay/${merchant.slug}/sign`,
  );
}
