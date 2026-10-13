import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/dal";
import { getEnv } from "@/lib/env";
import AccountForm from "../account-form";
export default async function SignIn() {
  if (await getSession()) redirect("/m");
  return (
    <>
      <h1>Welcome back</h1>
      <p>Sign in to manage your business.</p>
      <AccountForm mode="sign-in" paypal={getEnv().PAYPAL_LOGIN_ENABLED} />
      <nav>
        <Link href="/forgot-password">Forgot password?</Link>
        <Link href="/magic-link">Email me a sign-in link</Link>
        <Link href="/sign-up">Create an account</Link>
      </nav>
    </>
  );
}
