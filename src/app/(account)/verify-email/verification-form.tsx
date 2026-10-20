"use client";
import { useActionState } from "react";
import { requestVerification } from "../actions";
export default function VerificationForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(requestVerification, {});
  return (
    <form action={action} className="form-stack">
      <p className="text-2">Use the link sent to your inbox to verify your merchant account.</p>
      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="banner banner-success">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-primary btn-lg btn-block"
        disabled={!enabled || pending}
        aria-busy={pending || undefined}
      >
        {pending && <span className="spinner" aria-hidden="true" />}
        Send verification email
      </button>
      {!enabled && (
        <p className="banner banner-info">Email delivery isn&apos;t available right now.</p>
      )}
    </form>
  );
}
