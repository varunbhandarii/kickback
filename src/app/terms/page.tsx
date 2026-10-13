export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-semibold">Terms</h1>
      <p className="mt-6">
        Kickback currently operates with PayPal sandbox accounts and test
        balances. Purchases and loyalty refunds demonstrate the merchant’s
        published program and have no real monetary value. Use sandbox buyers
        and merchants only.
      </p>
      <h2 className="mt-8 text-xl font-semibold">Merchant authorization</h2>
      <p className="mt-4">
        Connecting a business authorizes Kickback to read recent and ongoing
        PayPal sales, recognize repeat customers using business-specific one-way
        codes, and submit partial refunds as rewards under the limits you
        activate. You are responsible for the business account, your
        credentials, menu prices, time zone, and program terms. Rewards use your
        merchant balance and return through the original payment rail. Kickback
        does not message your customers.
      </p>
      <h2 className="mt-8 text-xl font-semibold">
        Qualifying purchases and rewards
      </h2>
      <p className="mt-4">
        Each pay page shows the minimum purchase, visit or spending target, time
        window, and reward. Nearby payments may count as one visit. Historical
        milestones are consumed without retroactive refunds. Daily, monthly, and
        customer limits apply; returns and disputes can cancel progress, hold
        rewards, or offset later rewards. A reward may be delayed or fail if
        PayPal declines a refund or permissions are unavailable.
      </p>
      <h2 className="mt-8 text-xl font-semibold">Stopping the service</h2>
      <p className="mt-4">
        Pause rewards in your merchant dashboard or disconnect in Settings.
        Disconnect pauses checkout and future rewards immediately and schedules
        tenant data deletion within 48 hours. A refund already submitted to
        PayPal can still finish. Remove PayPal third-party permissions
        separately if desired. The{" "}
        <a className="underline" href="/privacy">
          privacy notice
        </a>{" "}
        explains retention and reconnection.
      </p>
      <p className="mt-4">
        PayPal’s payment-service terms also apply. Real processing requires
        provider approval and production readiness. For support, use{" "}
        <a
          className="underline"
          href="https://github.com/varunbhandarii/kickback/issues"
        >
          Kickback support
        </a>{" "}
        without posting credentials or customer data.
      </p>
    </main>
  );
}
