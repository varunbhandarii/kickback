export const metadata = { title: "Accept invitation" };
import Link from "next/link";
import { getSession } from "@/lib/dal";
import { AuthFrame } from "@/components/auth-frame";
import InviteForm from "./invite-form";
export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string; token?: string }>;
}) {
  const params = await searchParams,
    session = await getSession();
  return (
    <AuthFrame>
      <div className="flex flex-col gap-1.5">
        <h1 className="page-title">Business invitation</h1>
        <p className="page-sub" style={{ fontSize: 15 }}>
          You&apos;ve been invited to co-own a business on Kickback.
        </p>
      </div>
      {session ? (
        <>
          <p className="text-2">
            Signed in as <strong>{session.user.email}</strong>. Your email must be verified to accept.
          </p>
          {!session.user.emailVerified && (
            <p className="banner banner-warn">
              <span>
                <Link href="/verify-email" target="_blank">
                  Verify your email
                </Link>
                , then return to this invitation.
              </span>
            </p>
          )}
          <InviteForm merchant={params.merchant ?? ""} token={params.token ?? ""} />
        </>
      ) : (
        <>
          <p className="text-2">
            Sign in or create an account using the invited email, verify that inbox, then return to this invitation
            link.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/sign-in" target="_blank" className="btn btn-primary">
              Sign in
            </Link>
            <Link href="/sign-up" target="_blank" className="btn btn-secondary">
              Create account
            </Link>
          </div>
        </>
      )}
    </AuthFrame>
  );
}
