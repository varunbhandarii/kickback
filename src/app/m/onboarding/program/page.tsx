import { requireMerchant } from "@/lib/dal";
import { loadMerchant } from "@/lib/merchants";
import ProgramForm from "./program-form";
export default async function ProgramPage() {
  const { merchant } = await requireMerchant(),
    loaded = await loadMerchant(merchant.slug, true);
  return (
    <ProgramForm
      merchantId={merchant.id}
      category={merchant.category}
      initial={loaded?.spec}
    />
  );
}
