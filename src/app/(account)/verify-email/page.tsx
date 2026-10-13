import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { emailConfigured } from "@/lib/email";
import VerificationForm from "./verification-form";
export default async function VerifyEmailPage() {
  const user = await requireUser();
  return (
    <>
      <h1>Verify your email</h1>
      <p>{user.email}</p>
      {user.emailVerified ? (
        <p>
          Your email is verified. You can return to your invitation link or
          merchant dashboard.
        </p>
      ) : (
        <VerificationForm enabled={emailConfigured()} />
      )}
      <nav>
        <Link href="/m">Merchant dashboard</Link>
        <Link href="/sign-in">Sign in</Link>
      </nav>
    </>
  );
}
