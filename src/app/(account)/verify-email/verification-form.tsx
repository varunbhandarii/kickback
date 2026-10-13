"use client";
import { useActionState } from "react";
import { requestVerification } from "../actions";
export default function VerificationForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(requestVerification, {});
  return (
    <form action={action}>
      <p>Use the link sent to your inbox to verify your merchant account.</p>
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
      <button className="merchant-primary" disabled={!enabled || pending}>
        Send verification email
      </button>
      {!enabled && <p>Email delivery is temporarily unavailable.</p>}
    </form>
  );
}
