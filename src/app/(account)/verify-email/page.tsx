export const metadata = { title: "Verify email" };
import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { emailConfigured } from "@/lib/email";
import VerificationForm from "./verification-form";
import { StatusChip } from "@/components/ui";
export default async function VerifyEmailPage() {
  const user = await requireUser();
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="page-title">Verify your email</h1>
        <div className="flex flex-wrap items-center gap-2.5">
          <span style={{ fontWeight: 600 }}>{user.email}</span>
          <StatusChip
            tone={user.emailVerified ? "success" : "warn"}
            label={user.emailVerified ? "Verified" : "Not verified"}
            size="sm"
          />
        </div>
      </div>
      {user.emailVerified ? (
        <p className="text-2">
          Your email is verified. You can return to your invitation link or merchant dashboard.
        </p>
      ) : (
        <VerificationForm enabled={emailConfigured()} />
      )}
      <nav aria-label="Account" className="flex flex-wrap gap-x-5 gap-y-2" style={{ fontSize: 14.5 }}>
        <Link href="/m">Merchant dashboard</Link>
        <Link href="/sign-in">Sign in</Link>
      </nav>
    </>
  );
}
