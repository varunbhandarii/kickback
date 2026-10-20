import Link from "next/link";
import { ownedMerchant, requireUser } from "@/lib/dal";
import { cookies } from "next/headers";
import { BrandLink } from "@/components/brand";
import { Stepper } from "./stepper";
export default async function WizardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser(),
    selected = (await cookies()).get("kickback.merchant")?.value,
    merchant =
      (await ownedMerchant(user.id, selected)) ??
      (await ownedMerchant(user.id));
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="setup-head">
        <div className="setup-head-inner">
          <div className="flex min-w-0 items-center gap-4">
            <BrandLink href={merchant ? "/m" : "/"} size={20} withIcon />
            <span className="caption truncate" style={{ fontSize: 14 }}>
              Setting up {merchant?.displayName ?? "your business"}
            </span>
          </div>
          {merchant && (
            <Link href="/m" className="btn btn-ghost btn-sm">
              Save and finish later
            </Link>
          )}
        </div>
      </header>
      <main id="main" className="setup-body flex-1">
        <Stepper reached={merchant?.onboardingStep ?? "business"} />
        {children}
      </main>
    </div>
  );
}
