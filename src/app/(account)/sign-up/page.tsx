export const metadata = { title: "Create account" };
import Link from "next/link";
import AccountForm from "../account-form";
export default function SignUp() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="page-title">Welcome to Kickback</h1>
        <p className="page-sub" style={{ fontSize: 15 }}>
          Create your merchant account. You&apos;ll connect your business next.
        </p>
      </div>
      <AccountForm mode="sign-up" />
      <p className="caption" style={{ fontSize: 13.5 }}>
        By signing up you agree to our <Link href="/terms">terms</Link> and{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>
      <nav aria-label="Account" style={{ fontSize: 14.5 }}>
        <span className="text-2">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </span>
      </nav>
    </>
  );
}
