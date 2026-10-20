export const metadata = { title: "Business details" };
import { requireUser, ownedMerchant } from "@/lib/dal";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import BusinessForm from "./business-form";
export default async function Business() {
  const user = await requireUser(),
    selected = (await cookies()).get("kickback.merchant")?.value,
    merchant =
      (await ownedMerchant(user.id, selected)) ??
      (await ownedMerchant(user.id));
  return (
    <div className="setup-grid">
      <div className="setup-main">
        <div className="flex flex-col gap-1.5">
          <h1 className="page-title">Your business</h1>
          <p className="page-sub" style={{ fontSize: 15 }}>
            Start with the name customers know and the time zone for your visits.
          </p>
        </div>
        <BusinessForm
          host={new URL(getEnv().APP_URL).host}
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
      </div>
      <aside className="setup-aside">
        <div className="card card-tint card-pad flex flex-col gap-3">
          <h2 className="card-title">What happens next</h2>
          <ol className="flex flex-col gap-2.5" style={{ fontSize: 14, lineHeight: 1.5 }}>
            <li>1. Connect your PayPal business account.</li>
            <li>2. Kickback reads your recent sales so regulars keep their visits.</li>
            <li>3. Pick a program designed from those sales, then print your sign.</li>
          </ol>
        </div>
      </aside>
    </div>
  );
}
