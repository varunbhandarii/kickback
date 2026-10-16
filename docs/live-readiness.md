# Live readiness

Kickback is a sandbox demonstration. Test balances, successful merchant consent and refund tests do not establish approval to process live platform payments or to use refunds as a loyalty mechanism.

The consent path uses PayPal Partner Referrals and merchant-scoped API assertions. Live platform access requires PayPal approval, including reporting permissions needed for reconciliation. See [PayPal's platform onboarding process](https://developer.paypal.com/platforms/get-started). The operator must obtain a written answer about this reward model, refund/risk treatment, seller countries and scopes before enabling live mode. No approval or application submission is claimed here.

The merchant-owned app connection is an alternative credential arrangement, not a way around provider approval, seller permissions or applicable agreements. Credentials are encrypted for the connected tenant; rotating or disconnecting them stops future use.

Before live operation:

- Obtain platform/product permission and review loyalty refunds, customer-facing terms, sales-tax treatment, retention, dispute handling and merchant consent with the appropriate advisers.
- Establish production operator contact details, privacy/deletion processes, a verified email sender and a final pricing agreement.
- Use production app credentials and independently verify webhooks, merchant identity, budgets, reconciliation and recovery. Sandbox wallet eligibility is not evidence of live availability.
- Establish production licenses for dashboard components and operational monitoring, backups, restore tests and incident ownership.
- Collect and review CSP reports before considering an enforced policy. The current policy is report-only and allows inline scripts/styles.
- Review Render user API-key access, isolate operational credentials as appropriate, and rotate temporary integration keys after evaluation access ends.

Kickback's refund-count and reward-to-revenue ceilings are product guardrails. They are not thresholds approved by PayPal, and PayPal may still count a loyalty reward as a refund in its risk models. The cohort chart describes observed repeat visits; it does not measure causal program lift.
