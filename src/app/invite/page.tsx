import Link from "next/link";
import { getSession } from "@/lib/dal";
import InviteForm from "./invite-form";
export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string; token?: string }>;
}) {
  const params = await searchParams,
    session = await getSession();
  return (
    <main className="account-shell merchant-shell">
      <section className="merchant-card">
        <h1>Business invitation</h1>
        {session ? (
          <>
            <p>
              Signed in as {session.user.email}. Your email must be verified to
              accept.
            </p>
            {!session.user.emailVerified && (
              <p>
                <Link href="/verify-email" target="_blank">
                  Verify your email
                </Link>
                , then return to this invitation.
              </p>
            )}
            <InviteForm
              merchant={params.merchant ?? ""}
              token={params.token ?? ""}
            />
          </>
        ) : (
          <>
            <p>
              Sign in or create an account using the invited email, verify that
              inbox, then return to this invitation link.
            </p>
            <p>
              <Link href="/sign-in" target="_blank">
                Sign in
              </Link>{" "}
              ·{" "}
              <Link href="/sign-up" target="_blank">
                Create account
              </Link>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
