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
    <form action={action}>
      <input name="merchant" type="hidden" value={merchant} />
      <input name="token" type="hidden" value={token} />
      <p>
        Accepting grants you full co-owner access to this business, including
        reward and connection controls.
      </p>
      {state.error && <p role="alert">{state.error}</p>}
      <button disabled={pending}>Accept invitation</button>
    </form>
  );
}
