import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/dal";
import { getEnv } from "@/lib/env";
import AccountForm from "../account-form";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) redirect("/m");
  const { error } = await searchParams;
  return (
    <>
      <h1>Welcome back</h1>
      <p>Sign in to manage your business.</p>
      {error && (
        <p role="alert" className="merchant-error">
          {error === "email_not_found"
            ? "PayPal did not return an email address. Check the app's name and email permissions, or sign in with email and password."
            : "PayPal sign-in could not complete. Try again, or sign in with email and password."}
        </p>
      )}
      <AccountForm mode="sign-in" paypal={getEnv().PAYPAL_LOGIN_ENABLED} />
      <nav>
        <Link href="/forgot-password">Forgot password?</Link>
        <Link href="/magic-link">Email me a sign-in link</Link>
        <Link href="/sign-up">Create an account</Link>
      </nav>
    </>
  );
}
