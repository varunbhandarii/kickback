export const metadata = { title: "Reset password" };
import Link from "next/link";
import AccountForm from "../account-form";
export default async function Reset({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="page-title">Choose a new password</h1>
        <p className="page-sub" style={{ fontSize: 15 }}>
          Your reset link works once. After saving, sign in with the new password.
        </p>
      </div>
      <AccountForm mode="reset" token={token ?? ""} />
      <nav aria-label="Account" style={{ fontSize: 14.5 }}>
        <Link href="/sign-in">Back to sign in</Link>
      </nav>
    </>
  );
}
