"use client";
import { useActionState, useState } from "react";
import { deleteAccount } from "./team-actions";
export default function DeleteAccountForm() {
  const [confirm, setConfirm] = useState(false),
    [state, action, pending] = useActionState(deleteAccount, {});
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="card-title">Delete account</h3>
        <p className="text-2" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 4 }}>
          This removes your sign-in, sessions, and memberships. Businesses where you are the only owner are
          disconnected and their tenant data is scheduled for deletion within 48 hours. Businesses with other
          owners remain available to them.
        </p>
      </div>
      {confirm ? (
        <form action={action} className="form-stack" style={{ maxWidth: 420 }}>
          <label className="field">
            <span className="field-label">Current password (if you sign in by password)</span>
            <input
              className="input"
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
            />
          </label>
          <label className="field">
            <span className="field-label">Type DELETE MY ACCOUNT</span>
            <input className="input mono" name="confirm" autoComplete="off" required />
          </label>
          {state.error && (
            <p role="alert" className="alert">
              {state.error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn btn-danger-solid" disabled={pending} aria-busy={pending || undefined}>
              {pending && <span className="spinner" aria-hidden="true" />}
              Permanently delete my account
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-danger self-start" onClick={() => setConfirm(true)}>
          Delete account…
        </button>
      )}
    </div>
  );
}
