# Kickback

Payment-linked loyalty for small merchants on PayPal and Venmo.

Kickback currently provides a sandbox checkout, verified webhook ingestion, a small database foundation, and an AG Studio demo dashboard. Loyalty rewards and merchant-facing workflows are being built.

## Local setup

Use Node 24.21.0 (or Node >=22.12 and <25), npm, and Docker Desktop.

```powershell
npm ci
npm run env:init
# Fill PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.
docker compose up -d --wait
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Database port is 55432. See [setup](docs/setup.md) for every environment variable, sandbox account settings, and Render deployment instructions. Keep .env private; .env.example contains empty credential placeholders.

## Demo mode (coming)

For sandbox integration testing, enable DEMO_MODE=true and KICKBACK_ENV=sandbox. Open /dev/pay-test for PayPal/Venmo checkout and /dev/studio-test for a dashboard with synthetic rows. Wallet eligibility is checked through PayPal JS SDK v6. Disable these temporary tools before sharing a general deployment.

The application does not yet award loyalty rewards. Do not use real accounts or real funds.

## Integrations

- PayPal Orders v2: create and capture sandbox payments, using merchant assertions for connected merchants or merchant-owned app credentials for first-party checkout.
- PayPal Webhooks: verify signatures with PayPal, store each event once, and expire raw payloads.
- Partner Referrals: generate merchant consent links; confirm status with merchant integrations v1.
- AG Studio: a browser-only dashboard with synthetic data; unlicensed development displays a watermark.
- Anthropic: server-side SDK and structured Program Designer schema with local budget/range validation.
- Render: web service, Postgres 16, and purge cron described in render.yaml.
- Postman and APIMatic: optional development tooling; their setup is independent of the app runtime.

The server uses one PayPal REST transport for consistent retries, pacing, attribution, and idempotency headers. Its OAuth token cache never exposes client secrets to the browser. Learn more in [architecture](docs/architecture.md).

## Commands

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run jobs
npm run webhook:register -- https://your-app.onrender.com
```

Tests cover PayPal token caching, transient retries and stable request IDs, signed capture context, and webhook verification/rejection. Production builds use the standard Tailwind PostCSS integration and Webpack.

## Privacy

Webhook logs contain identifiers and statuses, not payer contact data. Raw payloads are retained with a 48-hour expiration and purged every 15 minutes. Minimal event receipts remain for duplicate protection. Sandbox privacy and terms pages are available at /privacy and /terms. The application remains a sandbox demonstration while account authorization and reward workflows are completed.

## License

[MIT](LICENSE)
