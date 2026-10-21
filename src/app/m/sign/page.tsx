export const metadata = { title: "Pay page and sign" };
import { requireMerchant } from "@/lib/dal";
import { loadMerchant } from "@/lib/merchants";
import { getEnv } from "@/lib/env";
import MenuForm, { SignActions } from "../onboarding/menu/menu-form";
import { SignSheet } from "@/app/pay/[slug]/sign/sign-sheet";
import { PageHeader, PunchRow, SpendBar } from "@/components/ui";
import { Endorsement } from "@/components/brand";
import { money, programHeadline } from "@/lib/format";
import { DemoLock } from "@/components/demo-lock";
export default async function SignPage() {
  const { merchant } = await requireMerchant(),
    loaded = await loadMerchant(merchant.slug, true),
    url = new URL(`/pay/${merchant.slug}`, getEnv().APP_URL).href,
    sandbox = getEnv().KICKBACK_ENV === "sandbox";
  const spec = loaded?.spec;
  return (
    <>
      <PageHeader title="Pay page and sign" sub="What customers see when they scan the sign on your counter." />
      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))" }}>
        <div className="flex min-w-0 flex-col gap-6">
          <DemoLock>
            <MenuForm merchantId={merchant.id} initial={merchant.menu} minTicketCents={spec?.minTicketCents} />
          </DemoLock>
          <section className="card card-pad flex flex-col gap-3" aria-labelledby="share-title">
            <div>
              <h2 id="share-title" className="card-title">
                Share and print
              </h2>
              <p className="mono caption" style={{ fontSize: 13, marginTop: 2, overflowWrap: "anywhere" }}>
                {url.replace(/^https?:\/\//, "")}
              </p>
            </div>
            <SignActions merchantId={merchant.id} slug={merchant.slug} />
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-3" aria-labelledby="preview-title">
            <div>
              <h2 id="preview-title" className="card-title">
                Pay page preview
              </h2>
              <p className="caption" style={{ fontSize: 13 }}>
                Shows your saved menu. Open the pay page to try it.
              </p>
            </div>
            <div
              aria-hidden="true"
              className="overflow-hidden"
              style={{ width: "100%", maxWidth: 360, borderRadius: 28, border: "1px solid var(--line)", background: "var(--paper)", boxShadow: "var(--shadow-pop)" }}
            >
              <div className="band flex flex-col gap-1.5" style={{ padding: "16px 18px 56px" }}>
                <span className="band-sub" style={{ fontSize: 11 }}>
                  <Endorsement inverse size={12} />
                </span>
                <span className="band-title" style={{ fontSize: 24 }}>
                  {merchant.displayName}
                </span>
                <span className="band-sub" style={{ fontSize: 13 }}>
                  {spec?.signPitch || "Thanks for stopping by."}
                </span>
              </div>
              <div className="flex flex-col gap-3" style={{ margin: "-40px 12px 0", paddingBottom: 16 }}>
                {spec && (
                  <div className="card flex flex-col gap-2.5" style={{ padding: 14 }}>
                    <span className="eyebrow" style={{ color: "var(--forest)", fontSize: 10.5 }}>
                      Regulars get money back
                    </span>
                    <span className="display" style={{ fontStretch: "125%", fontWeight: 800, fontSize: 19, lineHeight: 1.1 }}>
                      {programHeadline(spec)}
                    </span>
                    {spec.type === "VISIT_MILESTONE" ? (
                      <PunchRow target={spec.n} filled={0} rewardCents={spec.rewardCents} size="sm" />
                    ) : (
                      <SpendBar current={0} target={spec.spendCents} rewardCents={spec.rewardCents} />
                    )}
                  </div>
                )}
                <div className="card" style={{ padding: "4px 0" }}>
                  {merchant.menu.map((item, i) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3"
                      style={{ padding: "9px 14px", borderTop: i ? "1px solid var(--line)" : undefined }}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate" style={{ fontSize: 14, fontWeight: 500 }}>
                          {item.name}
                        </span>
                        {spec && (
                          <span className="caption" style={{ color: item.priceCents >= spec.minTicketCents ? "var(--forest)" : undefined }}>
                            {item.priceCents >= spec.minTicketCents ? "Counts as a visit" : `Under ${money(spec.minTicketCents)}`}
                          </span>
                        )}
                      </span>
                      <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>
                        {money(item.priceCents)}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  className="flex items-center justify-center text-center"
                  style={{ minHeight: 64, border: "1px dashed var(--line-strong)", borderRadius: 12, fontSize: 12.5, color: "var(--ink-3)", padding: 10 }}
                >
                  PayPal and Venmo checkout buttons appear here
                </div>
              </div>
            </div>
          </section>

          {spec && (
            <section className="flex flex-col gap-3" aria-labelledby="sign-title">
              <div>
                <h2 id="sign-title" className="card-title">
                  Counter sign
                </h2>
                <p className="caption" style={{ fontSize: 13 }}>
                  US Letter. Use Print sign to open the full-size version.
                </p>
              </div>
              <div style={{ width: "100%", maxWidth: 300 }}>
                <SignSheet name={merchant.displayName} spec={spec} url={url} sandbox={sandbox} thumbnail />
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
