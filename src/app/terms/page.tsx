export const metadata = { title: "Terms of use" };
import Link from "next/link";
import { PolicyLayout } from "@/components/policy-layout";

export default function Terms() {
  return (
    <PolicyLayout
      title="Terms of use"
      intro={
        <p>
          Kickback currently operates with PayPal sandbox accounts and test balances. Purchases and loyalty
          refunds demonstrate the merchant’s published program and have no real monetary value. Use sandbox
          buyers and merchants only.
        </p>
      }
      summary={[
        "Purchases and refunds use test balances and have no real monetary value.",
        "Merchants authorize Kickback to read sales and send rewards as partial refunds within the limits they activate.",
        "Pause rewards or disconnect at any time; disconnecting schedules data deletion within 48 hours.",
      ]}
    >
      <h2>Merchant authorization</h2>
      <p>
        Connecting a business authorizes Kickback to read recent and ongoing PayPal sales, recognize repeat
        customers using business-specific one-way codes, and submit partial refunds as rewards under the limits
        you activate. You are responsible for the business account, your credentials, menu prices, time zone,
        and program terms. Rewards use your merchant balance and return through the original payment rail.
        Kickback does not message your customers.
      </p>

      <h2>Qualifying purchases and rewards</h2>
      <p>
        Each pay page shows the minimum purchase, visit or spending target, time window, and reward. Nearby
        payments may count as one visit. Historical milestones are consumed without retroactive refunds. Daily,
        monthly, and customer limits apply; returns and disputes can cancel progress, hold rewards, or offset
        later rewards. A reward may be delayed or fail if PayPal declines a refund or permissions are
        unavailable.
      </p>

      <h2>Stopping the service</h2>
      <p>
        Pause rewards in your merchant dashboard or disconnect in Settings. Disconnect pauses checkout and future
        rewards immediately and schedules tenant data deletion within 48 hours. A refund already submitted to
        PayPal can still finish. Remove PayPal third-party permissions separately if desired. The{" "}
        <Link href="/privacy">privacy notice</Link> explains retention and reconnection.
      </p>

      <h2>Payment services and support</h2>
      <p>
        PayPal’s payment-service terms also apply. Real processing requires provider approval and production
        readiness. For support, use{" "}
        <a href="https://github.com/varunbhandarii/kickback/issues">Kickback support</a> without posting
        credentials or customer data.
      </p>
    </PolicyLayout>
  );
}
