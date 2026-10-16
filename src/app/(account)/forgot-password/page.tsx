export const metadata = { title: "Forgot password" };
import Link from "next/link";
import { emailConfigured } from "@/lib/email";
import AccountForm from "../account-form";
export const dynamic = "force-dynamic";
export default function Forgot() {
  return (
    <>
      <h1>Reset your password</h1>
      <p>Enter the email you used for your merchant account.</p>
      <AccountForm mode="forgot" emailEnabled={emailConfigured()} />
      <nav>
        <Link href="/sign-in">Back to sign in</Link>
      </nav>
    </>
  );
}
