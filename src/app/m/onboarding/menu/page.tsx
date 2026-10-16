export const metadata = { title: "Menu and sign" };
import { requireMerchant } from "@/lib/dal";
import MenuForm from "./menu-form";
export default async function MenuPage() {
  const { merchant } = await requireMerchant();
  return (
    <MenuForm
      merchantId={merchant.id}
      initial={merchant.menu}
      slug={merchant.slug}
      finish
    />
  );
}
