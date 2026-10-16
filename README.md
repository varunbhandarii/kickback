# Kickback

Payment-linked loyalty for small merchants on PayPal and Venmo.

Pay at a merchant, collect qualifying visits, and receive a thank-you partial refund when you earn a reward. Returning wallets are recognized without a separate customer account. The current deployment uses **sandbox accounts and test balances only**.

## Try it

Open [Rosa's Cafe](https://kickback-web.onrender.com/pay/rosas), choose a menu item or custom amount, and pay using a US PayPal sandbox buyer. The thank-you screen shows your progress and a private link to check it between visits. Five qualifying visits within 60 days earn $2 back; purchases within 120 minutes count as one visit. Venmo appears when the device and buyer are eligible.

Read the [program terms](https://kickback-web.onrender.com/pay/rosas/terms). The [printable sign](https://kickback-web.onrender.com/pay/rosas/sign) and [QR image](https://kickback-web.onrender.com/api/pay/rosas/qr.png) point to checkout.

## Connect your business

Create a [merchant account](https://kickback-web.onrender.com/sign-up), add your business and time zone, then connect PayPal through merchant consent or your own REST app credentials. Kickback verifies the connection with PayPal before enabling payments. With Transaction Search enabled, it reads up to 90 days of sales and carries existing visit progress into your program without issuing rewards for milestones completed in history.

Activate a visit or spending preset, edit the menu, and download a pay sign or QR. The merchant area includes customer codes, rewards, limits, staff exclusion, and pause/resume controls. Disconnect stops checkout and future rewards immediately and schedules customer/payment data and connection credentials for deletion within 48 hours. Printed pay links lock after the first download.

Email/password sign-in works independently of email delivery. Password reset, verification, single-use sign-in links, and co-owner invitations require a configured email sender. Optional PayPal sign-in requires its separate callback configuration. See [setup](docs/setup.md).

## Cockpit

The merchant [Cockpit](https://kickback-web.onrender.com/m/cockpit) combines reward and visit KPIs, charts, customer codes, a review grid, a Reward Funnel and a Customer Ledger. Layouts and recent conversations are saved per business. Risk adds held/failed rewards, a weekday-by-wallet pivot and Analyst usage. Tool results appear inline in chat. Loyalty includes descriptive repeat-visit cohorts and an explicit measurement limit. The lightweight Overview remains available on every screen.

The Analyst reads the selected business's pseudonymous data and backtests proposed rules through scoped tools. It can arrange charts through AG Studio agents; it cannot approve rewards, refund purchases, message customers or activate programs. Anthropic keys stay on the server. Synthetic and replay history remain labeled. See [architecture](docs/architecture.md) and [AI behavior](docs/ai.md).

## Run locally

Use Node 24.21.0 (or >=22.12 and <25), npm, and Docker Desktop.

```powershell
npm ci
npm run env:init
# Fill platform credentials and demo merchant IDs in the private .env.
docker compose up -d --wait
npm run db:migrate
npm run seed:demo
npm run dev
```

Open http://localhost:3000/pay/rosas. See [setup](docs/setup.md) for authorization, environment variables, and Render configuration.

## Demo mode

`DEMO_MODE=true` with `KICKBACK_ENV=sandbox` enables protected replay tools. Save a sandbox wallet with the merchant's permission and keep its token private:

```powershell
npm run replay -- --merchant rosas --count 4 --amount 5.50 --vault <saved-wallet-token>
```

Rapid purchases merge normally. Add `--historical` for explicit sandbox visit fixtures on earlier days, allowing the next browser purchase to demonstrate a reward. Actual capture timestamps remain unchanged. Add `--remote https://your-app.onrender.com` and configure `REMOTE_JOBS_BEARER` to use the hosted database. Remote batches are limited to four purchases. These tools cannot run in live mode.

## How it works

```mermaid
flowchart LR
  Payment[PayPal or Venmo capture] --> Ledger[Merchant wallet key and visit]
  Ledger --> Rules[Visit or spend rules]
  Rules --> Outbox[Durable reward row]
  Outbox --> Refund[Idempotent partial refund]
  Refund --> Webhook[Verified webhook or reconciliation]
  Webhook --> Progress[Reward status on the pay page]
```

The database commits a reward before an immediate background attempt. A five-minute worker recovers interrupted work. A unique reward per visit and persisted PayPal request IDs prevent duplicate payouts. Returned purchases cancel unpaid rewards or offset future rewards; disputes freeze eligibility. Merchant and global switches pause new refund attempts.

## Commands

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run check:concurrency
npm run check:ledger
npm run jobs
npm run pause -- rosas
npm run resume -- rosas
npm run pause -- all
npm run webhook:register -- https://your-app.onrender.com
```

Tests cover calendar boundaries, identity, merging, budgets, offsets, executor errors, webhook replay, signatures, API tokens, and pacing. The concurrency check uses real sandbox Postgres and removes only its own generated rows.

## AI used and why

The Program Designer translates a merchant goal and aggregate history into three proposals. A deterministic backtest supplies the figures; explanations must pass a number-faithfulness check. Guard routes rewards by code-defined risk signals and gives owners a review queue. Scribe proposes validated notes, a terms introduction and a sign pitch. Owner approval is required before a proposal changes the active rule or public copy. No AI feature can move money.

Demo businesses can include labeled synthetic history for the design step. These visits are excluded from live eligibility and their captures can never be refunded. Without an API key, presets, template notes and deterministic Guard still work. See [AI behavior and limits](docs/ai.md).

## Integrations and privacy

PayPal Orders v2 creates and captures payments; Payments v2 issues refunds; Partner Referrals obtains merchant consent. The REST client caches OAuth tokens and uses priority lanes, a burst of 10, and a 40-per-minute refill per process. AG Studio provides the merchant Cockpit with labeled demo history; Anthropic powers validated program proposals, metric-grounded explanations and thank-you copy. Render hosts Next.js, Postgres, and the recovery worker.

The loyalty ledger stores merchant-specific HMAC keys and payment identifiers, never provider account IDs, names, email addresses, phone numbers, or Venmo usernames. This pseudonymous ledger remains linkable; it is not a claim of anonymity or a provider-policy exemption. Raw webhook payloads expire after 47 hours and are purged every five minutes, with alerts for retention over 48 hours. Production retention, consent, provider approvals, and deployment licenses must be established before live use. See [architecture](docs/architecture.md) and [privacy](docs/privacy.md).

## Try the API

Import the [Postman collection and placeholder environment](postman/README.md). Keep credentials and session cookies in local values. A public Run in Postman link will be added after the collection is published.

## Tools used

The PayPal Context Plugin from APIMatic guided the server SDK order-lookup integration. Orders are read through `@paypal/paypal-server-sdk`; payment and refund execution retain the existing client. Render Workflows provides the optional reconciliation fan-out, with the five-minute cron as fallback.

## Security and live readiness

Responses include HSTS, nosniff, no-referrer, Permissions-Policy, popup-compatible COOP and frame protection. CSP is report-only; when configured, a first-party relay removes query strings before forwarding violations to Sentry. Private progress links expire and are rate-limited. Tokens are bearer links: anyone holding one can read its summary.

This is a sandbox demonstration, not a live-approved payments platform. Live use requires provider approval for the integration and reward model, operational and policy review, production credentials and licensing. See [live readiness](docs/live-readiness.md), [merchant reports FAQ](docs/merchant-faq.md) and [privacy](docs/privacy.md). Free in sandbox; no contract, no hardware, no customer app. Live pricing will be announced before launch.

[MIT license](LICENSE)
