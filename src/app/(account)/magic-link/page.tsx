import Link from "next/link";
import { emailConfigured } from "@/lib/email";
import AccountForm from "../account-form";
export const dynamic = "force-dynamic";
export default function MagicLinkPage() {
  return (
    <>
      <h1>Sign in by email</h1>
      <p>
        Use the email of an existing Kickback account. Your link expires in 10
        minutes and works once.
      </p>
      <AccountForm mode="magic" emailEnabled={emailConfigured()} />
      <nav>
        <Link href="/sign-in">Use a password</Link>
      </nav>
    </>
  );
}
