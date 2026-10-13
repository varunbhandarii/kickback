"use client";
import { useActionState } from "react";
import { submitPartner, submitByo, type ConnectState } from "./actions";
function Consent() {
  return (
    <div className="connection-consent">
      <p>
        Kickback will read your last 90 days of PayPal sales and check new sales
        afterward. Repeat customers are recognized by a one-way code; their
        PayPal account ID is discarded after deriving that code.
      </p>
      <p>
        Rewards are partial refunds from your PayPal account within your
        program&apos;s limits. We never message your customers. Raw webhook data
        is deleted within 48 hours during normal operation; history responses
        are processed in memory. You can pause or disconnect at any time.
        Account updates go only to your merchant email.
      </p>
      <p>
        <a href="/privacy" target="_blank" rel="noopener">
          Privacy
        </a>{" "}
        ·{" "}
        <a href="/terms" target="_blank" rel="noopener">
          Terms
        </a>
      </p>
      <label className="checkbox-label">
        <input type="checkbox" name="consent" required />I agree to connect my
        business and let Kickback perform these actions.
      </label>
    </div>
  );
}
export default function ConnectForms({ merchantId }: { merchantId: string }) {
  const [partner, connect, connecting] = useActionState<ConnectState, FormData>(
      submitPartner,
      {},
    ),
    [byo, save, saving] = useActionState<ConnectState, FormData>(submitByo, {});
  return (
    <div className="merchant-grid">
      <section className="merchant-card">
        <h2>Connect with PayPal</h2>
        <p>
          Approve access to your business account on PayPal. We verify the
          connection before enabling payments.
        </p>
        <form action={connect} className="merchant-form">
          <input name="merchantId" type="hidden" value={merchantId} />
          <Consent />
          {partner.error && (
            <p role="alert" className="merchant-error">
              {partner.error}
            </p>
          )}
          <button className="merchant-primary" disabled={connecting}>
            {connecting ? "Opening PayPal…" : "Connect with PayPal"}
          </button>
        </form>
      </section>
      <section className="merchant-card">
        <h2>Use my own API credentials</h2>
        <p>Use the REST app for your PayPal business account.</p>
        <details>
          <summary>Where to find these details</summary>
          <p>
            Developer dashboard → Apps &amp; Credentials → Sandbox (or Live) →
            your business&apos;s app. Enable checkout/refunds, Transaction
            Search, and Save payment methods, then save. Your Merchant ID is
            under PayPal Business Account Settings → Business information.
          </p>
          <p>
            Transaction Search is optional, but importing history needs it. The
            public HTTPS listener is registered on your app automatically.
          </p>
        </details>
        <form action={save} className="merchant-form">
          <input name="merchantId" type="hidden" value={merchantId} />
          <label>
            Client ID
            <input
              name="clientId"
              autoComplete="off"
              required
              maxLength={512}
            />
          </label>
          <label>
            Client secret
            <input
              name="clientSecret"
              type="password"
              autoComplete="off"
              required
              maxLength={2048}
            />
          </label>
          <label>
            Merchant ID (optional when Transaction Search is enabled)
            <input
              name="merchantIdInPayPal"
              autoComplete="off"
              pattern="[A-Z0-9]{13}"
              minLength={13}
              maxLength={13}
            />
          </label>
          <Consent />
          {byo.error && (
            <p role="alert" className="merchant-error">
              {byo.error}
            </p>
          )}
          <button className="merchant-primary" disabled={saving}>
            {saving ? "Validating…" : "Validate and connect"}
          </button>
        </form>
      </section>
    </div>
  );
}
