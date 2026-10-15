export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-semibold">Privacy notice</h1>
      <p className="mt-6">
        Kickback currently uses PayPal sandbox accounts and test balances. A
        merchant authorizes us to read up to 90 days of sales, recognize repeat
        visits, and send loyalty rewards as partial refunds within their program
        limits.
      </p>
      <h2 className="mt-8 text-xl font-semibold">Customer payment data</h2>
      <p className="mt-4">
        We turn a PayPal account ID into a one-way code specific to each
        business. The program ledger stores that code, wallets used, purchase
        and refund identifiers, visit dates and amounts, progress, and reward or
        dispute status. It does not store customer names, email addresses, phone
        numbers, provider account IDs, or Venmo usernames. Codes remain linkable
        within a business and are not anonymous. Guest purchases without an
        account ID are counted without creating a customer profile.
      </p>
      <p className="mt-4">
        Transaction Search responses are processed in memory; we store no raw
        Search rows. Signed payment webhooks may temporarily contain provider
        data. Raw webhook payloads expire after 47 hours and a job removes them
        every five minutes, targeting deletion within 48 hours. Outages can
        delay physical deletion. Minimal event receipts remain for duplicate
        protection.
      </p>
      <h2 className="mt-8 text-xl font-semibold">Merchant accounts</h2>
      <p className="mt-4">
        We store your sign-in email, business details, hashed password, database
        sessions, connection permissions, and consent record including timestamp
        and IP. Your own PayPal API secret is encrypted and bound to your
        business. Session access is limited to 30 days from creation. If email
        delivery is configured, we send only password resets and operational
        notices to business owners.
      </p>
      <h2 className="mt-8 text-xl font-semibold">Your choices</h2>
      <p className="mt-4">
        The Cockpit shows business-specific customer codes, not customer
        contacts. If the business uses the Analyst, relevant program rules,
        pseudonymous codes, metrics and chart instructions are sent to Anthropic
        to answer questions. The Analyst cannot move money or change a program.
        Conversations are kept for up to 30 idle days, with at most 20 per
        business; provider tool-turn data expires after 24 hours. Scheduled
        cleanup can be delayed by outages. Disconnecting schedules this business
        data for deletion too.
      </p>
      <p className="mt-4">
        We send no customer marketing messages, sell no customer profiles, and
        do not match customers across businesses. Customers can pay another way
        through the merchant to avoid recognition. Merchants can disconnect in
        Settings: checkout and future rewards stop immediately, and tenant
        customer and payment data plus connection credentials are scheduled for
        deletion within 48 hours. Reconnecting before deletion cancels that
        schedule. Merchant sign-in and business configuration remain so you can
        reconnect. You can also remove third-party access in PayPal settings.
      </p>
      <p className="mt-4">
        Audit records expire after 90 days; tenant deletion removes their
        customer/payment identifiers sooner. Order request fingerprints expire
        after seven days. Hosting, authentication email delivery when
        configured, and payment processing use Render, Resend, and PayPal
        respectively.
      </p>
      <p className="mt-6">
        For questions or deletion requests, contact the project operator through{" "}
        <a
          className="underline"
          href="https://github.com/varunbhandarii/kickback/issues"
        >
          Kickback support
        </a>
        . Do not include passwords, API secrets, or customer information in a
        public issue. Production contact details and policy review must be
        established before accepting real payments.
      </p>
    </main>
  );
}
