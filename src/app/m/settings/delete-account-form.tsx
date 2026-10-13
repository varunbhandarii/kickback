"use client";
import { useActionState, useState } from "react";
import { deleteAccount } from "./team-actions";
export default function DeleteAccountForm() {
  const [confirm, setConfirm] = useState(false),
    [state, action, pending] = useActionState(deleteAccount, {});
  return (
    <section className="merchant-card">
      <h2>Delete account</h2>
      <p>
        This removes your sign-in, sessions, and memberships. Businesses where
        you are the only owner are disconnected and their tenant data is
        scheduled for deletion within 48 hours. Businesses with other owners
        remain available to them.
      </p>
      {confirm ? (
        <form action={action}>
          <label>
            Current password (if you sign in by password)
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
            />
          </label>
          <label>
            Type DELETE MY ACCOUNT
            <input name="confirm" autoComplete="off" required />
          </label>
          {state.error && <p role="alert">{state.error}</p>}
          <button disabled={pending}>Permanently delete my account</button>{" "}
          <button
            type="button"
            className="secondary"
            onClick={() => setConfirm(false)}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button className="secondary" onClick={() => setConfirm(true)}>
          Delete account…
        </button>
      )}
    </section>
  );
}
