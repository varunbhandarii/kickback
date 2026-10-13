"use client";
import Link from "next/link";
import { useActionState } from "react";
import { requestVerification } from "../../(account)/actions";
import { sendInvite, revokeOwner } from "./team-actions";
export default function AccountSecurity({
  email,
  verified,
  emailEnabled,
  currentId,
  owners,
  merchantId,
}: {
  merchantId: string;
  email: string;
  verified: boolean;
  emailEnabled: boolean;
  currentId: string;
  owners: { id: string; email: string }[];
}) {
  const [verification, verify, verifying] = useActionState(
      requestVerification,
      {},
    ),
    [invite, send, sending] = useActionState(sendInvite, {});
  return (
    <section className="merchant-card">
      <h2>Account & co-owners</h2>
      <p>
        {email} · {verified ? "Email verified" : "Email not verified"}
      </p>
      {!verified && (
        <form action={verify}>
          <button disabled={!emailEnabled || verifying}>
            Send verification email
          </button>
          {verification.error && <p role="alert">{verification.error}</p>}
          {verification.message && <p role="status">{verification.message}</p>}
        </form>
      )}
      <p>
        <Link href="/forgot-password">Reset password</Link> ·{" "}
        <Link href="/magic-link">Sign in by email</Link>
      </p>
      <p>
        Co-owners have full access to this business, including refund controls
        and disconnect. Each invitation requires the recipient to verify their
        own inbox.
      </p>
      <ul>
        {owners.map((owner) => (
          <li key={owner.id}>
            {owner.email}
            {owner.id !== currentId && (
              <form action={revokeOwner}>
                <input name="merchantId" type="hidden" value={merchantId} />
                <input type="hidden" name="owner" value={owner.id} />
                <button className="secondary">Remove co-owner</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <form action={send}>
        <input name="merchantId" type="hidden" value={merchantId} />
        <label>
          Invite an owner by email
          <input type="email" name="email" required maxLength={254} />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" name="confirmAccess" required />I authorize
          this person to manage settings, rewards, and the PayPal connection.
        </label>
        <button disabled={!emailEnabled || !verified || sending}>
          Send co-owner invitation
        </button>
        {invite.error && <p role="alert">{invite.error}</p>}
        {invite.message && <p role="status">{invite.message}</p>}
      </form>
      {!emailEnabled && (
        <p className="muted">
          Email delivery must be configured before verification, sign-in links,
          or invitations can be used.
        </p>
      )}
    </section>
  );
}
