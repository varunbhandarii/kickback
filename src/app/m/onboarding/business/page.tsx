import { requireUser, ownedMerchant } from "@/lib/dal";
import { cookies } from "next/headers";
import BusinessForm from "./business-form";
export default async function Business() {
  const user = await requireUser(),
    selected = (await cookies()).get("kickback.merchant")?.value,
    merchant =
      (await ownedMerchant(user.id, selected)) ??
      (await ownedMerchant(user.id));
  return (
    <section className="merchant-card wizard-card">
      <h2>Your business</h2>
      <p>
        Start with the name customers know and the time zone for your visits.
      </p>
      <BusinessForm
        business={
          merchant
            ? {
                id: merchant.id,
                displayName: merchant.displayName,
                slug: merchant.slug,
                tz: merchant.tz,
                category: merchant.category,
                slugLocked: merchant.slugLocked,
              }
            : undefined
        }
      />
    </section>
  );
}
