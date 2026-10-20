export const metadata = { title: "Email sign-in link" };
import Link from "next/link";
import { emailConfigured } from "@/lib/email";
import AccountForm from "../account-form";
export const dynamic = "force-dynamic";
export default function MagicLinkPage() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="page-title">Sign in by email</h1>
        <p className="page-sub" style={{ fontSize: 15 }}>
          Use the email of an existing Kickback account. Your link expires in 10 minutes and works once.
        </p>
      </div>
      <AccountForm mode="magic" emailEnabled={emailConfigured()} />
      <nav aria-label="Account" style={{ fontSize: 14.5 }}>
        <Link href="/sign-in">Use a password</Link>
      </nav>
    </>
  );
}
