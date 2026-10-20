"use client";
import { useActionState } from "react";
import { submitPartner, submitByo, type ConnectState } from "./actions";
import { Icon } from "@/components/icons";
function Consent({ name }: { name?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="caption" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
        Kickback will read your last 90 days of PayPal sales and check new sales afterward. Repeat customers are
        recognized by a one-way code; their PayPal account ID is discarded after deriving that code. Rewards are
        partial refunds from your PayPal account within your program&apos;s limits. We never message your
        customers. Raw webhook data is deleted within 48 hours during normal operation; history responses are
        processed in memory. You can pause or disconnect at any time. Account updates go only to your merchant
        email.
      </p>
      <label className="check">
        <input type="checkbox" name="consent" required />
        <span>
          I agree to connect {name ?? "my business"} and let Kickback perform these actions.{" "}
          <a href="/privacy" target="_blank" rel="noopener">
            Privacy
          </a>{" "}
          ·{" "}
          <a href="/terms" target="_blank" rel="noopener">
            Terms
          </a>
        </span>
      </label>
    </div>
  );
}
export default function ConnectForms({ merchantId, name }: { merchantId: string; name?: string }) {
  const [partner, connect, connecting] = useActionState<ConnectState, FormData>(
      submitPartner,
      {},
    ),
    [byo, save, saving] = useActionState<ConnectState, FormData>(submitByo, {});
  return (
    <div className="flex flex-col gap-5">
      <form action={connect} className="card card-highlight card-pad form-stack">
        <input name="merchantId" type="hidden" value={merchantId} />
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}>
          <div className="flex flex-col gap-2.5">
            <h2 className="card-title flex items-center gap-2">
              Kickback will be able to
            </h2>
            <ul className="flex flex-col gap-2" style={{ fontSize: 14.5, lineHeight: 1.5 }}>
              {[
                "Read your last 90 days of PayPal sales and new sales after that",
                "Recognize returning customers with a one-way code",
                "Send rewards as partial refunds, inside limits you set",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <Icon name="check" size={18} strokeWidth={2.5} style={{ color: "var(--forest)", flex: "none", marginTop: 2 }} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2.5">
            <h2 className="card-title">Kickback will never</h2>
            <ul className="flex flex-col gap-2" style={{ fontSize: 14.5, lineHeight: 1.5 }}>
              {[
                "Message your customers",
                "Keep customer names, emails or phone numbers",
                "Send a reward above the limits you set",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <Icon name="x" size={18} strokeWidth={2.5} style={{ color: "var(--ink-3)", flex: "none", marginTop: 2 }} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Consent name={name} />
        {partner.error && (
          <p role="alert" className="alert">
            {partner.error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={connecting} aria-busy={connecting || undefined}>
            {connecting && <span className="spinner" aria-hidden="true" />}
            {connecting ? "Opening PayPal…" : "Continue to PayPal"}
          </button>
          <span className="caption" style={{ fontSize: 13.5 }}>
            Opens paypal.com. You can change or remove access there later.
          </span>
        </div>
      </form>

      <details className="card card-pad">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Use my own PayPal app credentials instead</summary>
        <div className="form-stack" style={{ marginTop: 14 }}>
          <p className="text-2" style={{ fontSize: 14, lineHeight: 1.55 }}>
            For developers who already have a PayPal REST app for this business account. Your secret is encrypted
            and bound to this business.
          </p>
          <details>
            <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--forest)" }}>
              Where to find these details
            </summary>
            <div className="flex flex-col gap-2" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55 }}>
              <p>
                Developer dashboard → Apps &amp; Credentials → Sandbox (or Live) → your business&apos;s app. Enable
                checkout/refunds, Transaction Search, and Save payment methods, then save. Your Merchant ID is under
                PayPal Business Account Settings → Business information.
              </p>
              <p>
                Transaction Search is optional, but importing history needs it. The public HTTPS listener is
                registered on your app automatically.
              </p>
            </div>
          </details>
          <form action={save} className="form-stack">
            <input name="merchantId" type="hidden" value={merchantId} />
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Client ID</span>
                <input className="input mono" name="clientId" autoComplete="off" required maxLength={512} />
              </label>
              <label className="field">
                <span className="field-label">Client secret</span>
                <input
                  className="input mono"
                  name="clientSecret"
                  type="password"
                  autoComplete="off"
                  required
                  maxLength={2048}
                />
              </label>
              <label className="field">
                <span className="field-label">Merchant ID</span>
                <input
                  className="input mono"
                  name="merchantIdInPayPal"
                  autoComplete="off"
                  pattern="[A-Z0-9]{13}"
                  minLength={13}
                  maxLength={13}
                  aria-describedby="merchant-id-help"
                />
                <span id="merchant-id-help" className="field-help">
                  Optional when Transaction Search is enabled.
                </span>
              </label>
            </div>
            <Consent name={name} />
            {byo.error && (
              <p role="alert" className="alert">
                {byo.error}
              </p>
            )}
            <button type="submit" className="btn btn-secondary self-start" disabled={saving} aria-busy={saving || undefined}>
              {saving && <span className="spinner" aria-hidden="true" />}
              {saving ? "Validating…" : "Validate and connect"}
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
