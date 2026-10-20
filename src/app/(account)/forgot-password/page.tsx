export const metadata = { title: "Forgot password" };
import Link from "next/link";
import { emailConfigured } from "@/lib/email";
import AccountForm from "../account-form";
export const dynamic = "force-dynamic";
export default function Forgot() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="page-title">Reset your password</h1>
        <p className="page-sub" style={{ fontSize: 15 }}>
          Enter the email you used for your merchant account.
        </p>
      </div>
      <AccountForm mode="forgot" emailEnabled={emailConfigured()} />
      <nav aria-label="Account" style={{ fontSize: 14.5 }}>
        <Link href="/sign-in">Back to sign in</Link>
      </nav>
    </>
  );
}
