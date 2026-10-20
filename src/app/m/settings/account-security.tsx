"use client";
import Link from "next/link";
import { useActionState } from "react";
import { requestVerification } from "../../(account)/actions";
import { sendInvite, revokeOwner } from "./team-actions";
import { ConfirmButton } from "@/components/form-controls";
import { StatusChip } from "@/components/ui";
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="card-title">Your sign-in</h3>
        <div className="flex flex-wrap items-center gap-2.5">
          <span style={{ fontSize: 15, fontWeight: 600 }}>{email}</span>
          <StatusChip
            tone={verified ? "success" : "warn"}
            label={verified ? "Email verified" : "Email not verified"}
            size="sm"
          />
        </div>
        {!verified && (
          <form action={verify} className="flex flex-col gap-2">
            <button
              type="submit"
              className="btn btn-secondary self-start"
              disabled={!emailEnabled || verifying}
              aria-busy={verifying || undefined}
            >
              {verifying && <span className="spinner" aria-hidden="true" />}
              Send verification email
            </button>
            {verification.error && (
              <p role="alert" className="alert">
                {verification.error}
              </p>
            )}
            {verification.message && (
              <p role="status" className="status-line">
                {verification.message}
              </p>
            )}
          </form>
        )}
        <p style={{ fontSize: 14 }}>
          <Link href="/forgot-password">Reset password</Link> · <Link href="/magic-link">Sign in by email</Link>
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h3 className="card-title">Co-owners</h3>
          <p className="text-2" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 4 }}>
            Co-owners have full access to this business, including refund controls and disconnect. Each
            invitation requires the recipient to verify their own inbox.
          </p>
        </div>
        <ul style={{ border: "1px solid var(--line)", borderRadius: 12 }}>
          {owners.map((owner, i) => (
            <li
              key={owner.id}
              className="flex flex-wrap items-center justify-between gap-3"
              style={{ padding: "10px 14px", borderTop: i ? "1px solid var(--line)" : undefined, fontSize: 14 }}
            >
              <span className="min-w-0 truncate">
                {owner.email}
                {owner.id === currentId && <span className="caption"> · you</span>}
              </span>
              {owner.id !== currentId && (
                <form action={revokeOwner}>
                  <input name="merchantId" type="hidden" value={merchantId} />
                  <input type="hidden" name="owner" value={owner.id} />
                  <ConfirmButton
                    className="btn btn-danger btn-sm"
                    title={`Remove ${owner.email}?`}
                    body={<p>They lose access to this business right away. You can invite them again later.</p>}
                    confirmLabel="Remove co-owner"
                    confirmClassName="btn btn-danger-solid"
                  >
                    Remove
                  </ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        <form action={send} className="form-stack" style={{ maxWidth: 520 }}>
          <input name="merchantId" type="hidden" value={merchantId} />
          <label className="field">
            <span className="field-label">Invite an owner by email</span>
            <input className="input" type="email" name="email" required maxLength={254} />
          </label>
          <label className="check">
            <input type="checkbox" name="confirmAccess" required />
            <span>I authorize this person to manage settings, rewards, and the PayPal connection.</span>
          </label>
          <button
            type="submit"
            className="btn btn-secondary self-start"
            disabled={!emailEnabled || !verified || sending}
            aria-busy={sending || undefined}
          >
            {sending && <span className="spinner" aria-hidden="true" />}
            Send co-owner invitation
          </button>
          {invite.error && (
            <p role="alert" className="alert">
              {invite.error}
            </p>
          )}
          {invite.message && (
            <p role="status" className="status-line">
              {invite.message}
            </p>
          )}
        </form>
        {!emailEnabled ? (
          <p className="banner banner-info">
            Email delivery isn&apos;t set up, so verification, sign-in links and invitations are unavailable.
          </p>
        ) : (
          !verified && <p className="caption">Verify your email before inviting a co-owner.</p>
        )}
      </div>
    </div>
  );
}
