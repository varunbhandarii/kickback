"use client";
import { useActionState, useState } from "react";
import { disconnectAction, updateBusiness } from "../actions";
export function BusinessSettings({
  initial,
}: {
  initial: {
    id: string;
    displayName: string;
    slug: string;
    tz: string;
    category: string;
    slugLocked: boolean;
  };
}) {
  const [state, action, pending] = useActionState(updateBusiness, {});
  return (
    <form action={action} className="merchant-card">
      <input name="merchantId" type="hidden" value={initial.id} />
      <h2>Business details</h2>
      <label>
        Business name
        <input
          name="displayName"
          defaultValue={initial.displayName}
          required
          minLength={2}
          maxLength={80}
        />
      </label>
      <label>
        Pay-link name
        <input
          name="slug"
          defaultValue={initial.slug}
          readOnly={initial.slugLocked}
          required
          minLength={3}
          maxLength={40}
        />
      </label>
      {initial.slugLocked && (
        <p className="muted">Locked to keep printed signs working.</p>
      )}
      <label>
        Time zone (IANA)
        <input name="tz" defaultValue={initial.tz} required />
      </label>
      <label>
        Category
        <select name="category" defaultValue={initial.category}>
          {["cafe", "salon", "bakery", "other"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
      <button disabled={pending}>Save business details</button>
    </form>
  );
}
export function DisconnectForm({ merchantId }: { merchantId: string }) {
  const [confirm, setConfirm] = useState(false),
    [state, action, pending] = useActionState(disconnectAction, {});
  return (
    <section className="merchant-card">
      <h2>Disconnect PayPal</h2>
      <p>
        This immediately pauses checkout and rewards. Customer and payment data
        will be deleted within 48 hours. A refund already submitted to PayPal
        may still finish.
      </p>
      {!confirm ? (
        <button className="secondary" onClick={() => setConfirm(true)}>
          Disconnect…
        </button>
      ) : (
        <form action={action}>
          <input name="merchantId" type="hidden" value={merchantId} />
          <label>
            Type DISCONNECT to confirm
            <input name="confirm" autoComplete="off" required />
          </label>
          {state.error && <p role="alert">{state.error}</p>}
          <button disabled={pending}>Confirm disconnect</button>{" "}
          <button
            type="button"
            className="secondary"
            onClick={() => setConfirm(false)}
          >
            Cancel
          </button>
        </form>
      )}
      <p className="muted">
        Disconnecting here does not remove the grant in PayPal.{" "}
        <a
          href="https://www.paypal.com/us/cshelp/article/how-do-i-remove-a-third-party%E2%80%99s-permission-to-access-my-paypal-account-help226"
          target="_blank"
          rel="noreferrer"
        >
          Remove third-party access in PayPal settings
        </a>
        .
      </p>
    </section>
  );
}
