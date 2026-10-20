"use client";
import { useActionState } from "react";
import { acceptInvite } from "./actions";
export default function InviteForm({
  merchant,
  token,
}: {
  merchant: string;
  token: string;
}) {
  const [state, action, pending] = useActionState(acceptInvite, {});
  return (
    <form action={action} className="form-stack">
      <input name="merchant" type="hidden" value={merchant} />
      <input name="token" type="hidden" value={token} />
      <p className="text-2" style={{ fontSize: 14.5, lineHeight: 1.55 }}>
        Accepting grants you full co-owner access to this business, including reward and connection controls.
      </p>
      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={pending} aria-busy={pending || undefined}>
        {pending && <span className="spinner" aria-hidden="true" />}
        Accept invitation
      </button>
    </form>
  );
}
