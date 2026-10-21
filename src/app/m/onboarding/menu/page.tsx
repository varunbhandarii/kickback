export const metadata = { title: "Menu and sign" };
import { requireOwnerMerchant } from "@/lib/dal";
import { loadMerchant } from "@/lib/merchants";
import { getEnv } from "@/lib/env";
import MenuForm, { SignActions } from "./menu-form";
import { SignSheet } from "@/app/pay/[slug]/sign/sign-sheet";
export default async function MenuPage() {
  const { merchant } = await requireOwnerMerchant(),
    loaded = await loadMerchant(merchant.slug, true),
    url = new URL(`/pay/${merchant.slug}`, getEnv().APP_URL).href;
  return (
    <div className="setup-grid">
      <div className="setup-main">
        <div className="flex flex-col gap-1.5">
          <h1 className="page-title">Menu and sign</h1>
          <p className="page-sub" style={{ fontSize: 15 }}>
            Add what you sell, then print the sign for your counter. Saving finishes setup.
          </p>
        </div>
        <MenuForm
          merchantId={merchant.id}
          initial={merchant.menu}
          minTicketCents={loaded?.spec.minTicketCents}
          finish
        />
      </div>
      <aside className="setup-aside">
        <div className="card card-pad flex flex-col gap-3">
          <h2 className="card-title">Your counter sign</h2>
          {loaded && (
            <div style={{ maxWidth: 280 }}>
              <SignSheet
                name={merchant.displayName}
                spec={loaded.spec}
                url={url}
                sandbox={getEnv().KICKBACK_ENV === "sandbox"}
                thumbnail
              />
            </div>
          )}
          <SignActions merchantId={merchant.id} slug={merchant.slug} />
        </div>
      </aside>
    </div>
  );
}
