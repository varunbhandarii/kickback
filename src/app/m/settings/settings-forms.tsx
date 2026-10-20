"use client";
import { useActionState, useState } from "react";
import { useTimeZones } from "@/components/use-time-zones";
import { disconnectAction, updateBusiness } from "../actions";
import { category as categoryLabel } from "@/lib/copy";
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
  const zoneList = useTimeZones();
  return (
    <form action={action} className="form-stack">
      <input name="merchantId" type="hidden" value={initial.id} />
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Business name</span>
          <input
            className="input"
            name="displayName"
            defaultValue={initial.displayName}
            required
            minLength={2}
            maxLength={80}
          />
        </label>
        <label className="field">
          <span className="field-label">Pay-link name</span>
          <input
            className="input mono"
            name="slug"
            defaultValue={initial.slug}
            readOnly={initial.slugLocked}
            aria-describedby="slug-help"
            required
            minLength={3}
            maxLength={40}
          />
          <span id="slug-help" className="field-help">
            {initial.slugLocked
              ? "Locked after your first sign or QR download so printed signs keep working."
              : "Lowercase letters, numbers and dashes. It locks after you print a sign."}
          </span>
        </label>
        <label className="field">
          <span className="field-label">Time zone</span>
          <input
            className="input"
            name="tz"
            list="tz-options"
            defaultValue={initial.tz}
            aria-describedby="tz-help"
            required
          />
          <datalist id="tz-options">
            {zoneList.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          <span id="tz-help" className="field-help">
            Visits, budgets and reports use this time zone, for example America/New_York.
          </span>
        </label>
        <label className="field">
          <span className="field-label">Category</span>
          <select className="select" name="category" defaultValue={initial.category}>
            {["cafe", "salon", "bakery", "other"].map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending || undefined}>
          {pending && <span className="spinner" aria-hidden="true" />}
          Save business details
        </button>
        {state.message && (
          <p role="status" className="status-line">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
export function DisconnectForm({ merchantId }: { merchantId: string }) {
  const [confirm, setConfirm] = useState(false),
    [state, action, pending] = useActionState(disconnectAction, {});
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="card-title">Disconnect PayPal</h3>
        <p className="text-2" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 4 }}>
          This immediately pauses checkout and rewards. Customer and payment data will be deleted within 48
          hours. A refund already submitted to PayPal may still finish.
        </p>
      </div>
      {!confirm ? (
        <button type="button" className="btn btn-danger self-start" onClick={() => setConfirm(true)}>
          Disconnect PayPal…
        </button>
      ) : (
        <form action={action} className="form-stack" style={{ maxWidth: 420 }}>
          <input name="merchantId" type="hidden" value={merchantId} />
          <label className="field">
            <span className="field-label">Type DISCONNECT to confirm</span>
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
              Disconnect PayPal
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <p className="caption" style={{ fontSize: 13 }}>
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
    </div>
  );
}
