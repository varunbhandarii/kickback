export const metadata = { title: "Create account" };
import Link from "next/link";
import AccountForm from "../account-form";
export default function SignUp() {
  return (
    <>
      <h1>Welcome to Kickback</h1>
      <p>
        Create your merchant account. You&apos;ll connect your business next.
      </p>
      <AccountForm mode="sign-up" />
      <p>
        By signing up you agree to our <Link href="/terms">terms</Link> and{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>
      <nav>
        <Link href="/sign-in">Already have an account? Sign in</Link>
      </nav>
    </>
  );
}
