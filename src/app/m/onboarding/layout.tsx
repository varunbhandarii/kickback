import Link from "next/link";
import { ownedMerchant, requireUser } from "@/lib/dal";
import { cookies } from "next/headers";
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
    <>
      <div className="wizard-heading">
        <p className="pay-eyebrow">Set up your business</p>
        <p>{merchant?.displayName ?? "New business"}</p>
        <h1>Make coming back feel good.</h1>
        <nav aria-label="Setup steps">
          {["business", "connect", "history", "program", "menu"].map(
            (step, index) => (
              <Link key={step} href={`/m/onboarding/${step}`}>
                {index + 1}.{" "}
                {step === "menu"
                  ? "Menu & sign"
                  : step[0].toUpperCase() + step.slice(1)}
              </Link>
            ),
          )}
        </nav>
      </div>
      {children}
    </>
  );
}
