export const metadata = { title: "Privacy" };
import { PolicyLayout } from "@/components/policy-layout";

const kept: [string, string, string][] = [
  [
    "Customer ledger",
    "Business-specific code, wallets used, purchase and refund identifiers, visit dates and amounts, progress, reward or dispute status",
    "While the business is connected",
  ],
  ["Transaction Search responses", "Processed in memory only", "Not stored"],
  ["Raw webhook payloads", "Signed payment events from PayPal", "Expire after 47 hours, deleted within 48"],
  [
    "Merchant account",
    "Sign-in email, business details, hashed password, sessions, connection permissions, consent record",
    "While the account exists; sessions up to 30 days",
  ],
  ["Private progress link", "Visit progress, last-visit date, recent reward totals", "Up to 365 days, renewed after a recognized payment"],
  ["Analyst conversations", "Questions and answers, at most 20 per business", "Up to 30 idle days"],
  ["Analyst telemetry", "Run identifiers, counts, timing", "Up to 90 days"],
  ["Audit records", "Administrative actions", "90 days"],
  ["Order request fingerprints", "Duplicate-payment protection", "7 days"],
];

export default function Privacy() {
  return (
    <PolicyLayout
      title="Privacy notice"
      intro={
        <p>
          Kickback currently uses PayPal sandbox accounts and test balances. A merchant authorizes us to read up
          to 90 days of sales, recognize repeat visits, and send loyalty rewards as partial refunds within their
          program limits.
        </p>
      }
      summary={[
        "Customers are recognized by a one-way code specific to each business, never by name, email or phone.",
        "We send no customer marketing messages, sell no customer profiles, and do not match customers across businesses.",
        "Disconnecting schedules customer and payment data for deletion within 48 hours.",
      ]}
    >
      <h2>Data we keep</h2>
      <div className="table-wrap card">
        <table className="table">
          <caption className="sr-only">What Kickback keeps and for how long</caption>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">What it contains</th>
              <th scope="col">How long</th>
            </tr>
          </thead>
          <tbody>
            {kept.map(([name, what, how]) => (
              <tr key={name}>
                <th scope="row" style={{ fontWeight: 600 }}>
                  {name}
                </th>
                <td>{what}</td>
                <td>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Customer payment data</h2>
      <p>
        We turn a PayPal account ID into a one-way code specific to each business. The program ledger stores that
        code, wallets used, purchase and refund identifiers, visit dates and amounts, progress, and reward or
        dispute status. It does not store customer names, email addresses, phone numbers, provider account IDs,
        or Venmo usernames. Codes remain linkable within a business and are not anonymous. Guest purchases
        without an account ID are counted without creating a customer profile.
      </p>
      <p>
        Transaction Search responses are processed in memory; we store no raw Search rows. Signed payment
        webhooks may temporarily contain provider data. Raw webhook payloads expire after 47 hours and a job
        removes them every five minutes, targeting deletion within 48 hours. Outages can delay physical deletion.
        Minimal event receipts remain for duplicate protection.
      </p>

      <h2>Merchant accounts</h2>
      <p>
        We store your sign-in email, business details, hashed password, database sessions, connection
        permissions, and consent record including timestamp and IP. Your own PayPal API secret is encrypted and
        bound to your business. Session access is limited to 30 days from creation. If email delivery is
        configured, we send only password resets and operational notices to business owners.
      </p>

      <h2>Private progress links</h2>
      <p>
        A private progress link lasts up to 365 days and is renewed after a recognized payment. Anyone holding it
        can see visit progress, the last-visit date and recent reward totals without signing in. Keep it private.
        It shows no payer contacts or wallet type.
      </p>

      <h2>Cockpit and Analyst</h2>
      <p>
        Analyst telemetry stores run identifiers, counts and timing for up to 90 days, with server token/cost
        records; it contains no prompts, answers or tool arguments. When security reporting is configured, a
        first-party relay removes URL query strings, fragments and snippets before forwarding CSP reports to
        Sentry. The operator controls Sentry retention.
      </p>
      <p>
        The Cockpit shows business-specific customer codes, not customer contacts. If the business uses the
        Analyst, relevant program rules, pseudonymous codes, metrics and chart instructions are sent to Anthropic
        to answer questions. The Analyst cannot move money or change a program. Conversations are kept for up to
        30 idle days, with at most 20 per business; provider tool-turn data expires after 24 hours. Scheduled
        cleanup can be delayed by outages. Disconnecting schedules this business data for deletion too.
      </p>

      <h2>Your choices</h2>
      <p>
        We send no customer marketing messages, sell no customer profiles, and do not match customers across
        businesses. Customers can pay another way through the merchant to avoid recognition. Merchants can
        disconnect in Settings: checkout and future rewards stop immediately, and tenant customer and payment
        data plus connection credentials are scheduled for deletion within 48 hours. Reconnecting before deletion
        cancels that schedule. Merchant sign-in and business configuration remain so you can reconnect. You can
        also remove third-party access in PayPal settings.
      </p>

      <h2>Retention and service providers</h2>
      <p>
        Audit records expire after 90 days; tenant deletion removes their customer/payment identifiers sooner.
        Order request fingerprints expire after seven days. Hosting, authentication email delivery when
        configured, and payment processing use Render, Resend, and PayPal respectively.
      </p>

      <h2>Contact</h2>
      <p>
        For questions or deletion requests, contact the project operator through{" "}
        <a href="https://github.com/varunbhandarii/kickback/issues">Kickback support</a>. Do not include
        passwords, API secrets, or customer information in a public issue. Production contact details and policy
        review must be established before accepting real payments.
      </p>
    </PolicyLayout>
  );
}
