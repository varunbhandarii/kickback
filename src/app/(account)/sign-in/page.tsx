export const metadata = { title: "Sign in" };
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
      <div className="flex flex-col gap-1.5">
        <h1 className="page-title">Welcome back</h1>
        <p className="page-sub" style={{ fontSize: 15 }}>
          Sign in to manage your business.
        </p>
      </div>
      {error && (
        <p role="alert" className="alert">
          {error === "email_not_found"
            ? "PayPal did not return an email address. Check the app's name and email permissions, or sign in with email and password."
            : "PayPal sign-in could not complete. Try again, or sign in with email and password."}
        </p>
      )}
      <AccountForm mode="sign-in" paypal={getEnv().PAYPAL_LOGIN_ENABLED} />
      <nav aria-label="Other ways in" className="flex flex-col items-start gap-2" style={{ fontSize: 14.5 }}>
        <Link href="/magic-link">Email me a sign-in link</Link>
        <span className="text-2">
          New to Kickback? <Link href="/sign-up">Create an account</Link>
        </span>
      </nav>
    </>
  );
}
