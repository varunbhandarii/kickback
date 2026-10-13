# Run Kickback

Use sandbox accounts and Node 24.21.0 (>=22.12 and <25 locally).

```powershell
npm ci
npm run env:init
# Edit .env: platform credentials, merchant IDs, APP_URL.
docker compose up -d --wait
npm run db:migrate
npm run seed:demo
npm run dev
```

The initializer preserves `.env` and generates encryption/job keys without printing them. Docker Postgres listens at `127.0.0.1:55432`. Set `APP_URL=http://localhost:3000` locally; the pay API checks the exact browser origin. Never commit secrets or rotate the master key without migrating identities and encrypted connections.

## Environment

| Variable | Purpose |
| --- | --- |
| `KICKBACK_ENV` | `sandbox`; live rejects demo tools and signature bypass |
| `DATABASE_URL`, `POSTGRES_PORT` | Database connection/local port (55432) |
| `APP_URL` | Browser origin, QR links, return URLs |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Platform app credentials |
| `PAYPAL_PARTNER_ID`, `PAYPAL_BN_CODE`, `PAYPAL_WEBHOOK_ID` | Platform merchant ID, attribution, registered listener |
| `MERCHANT_{ROSAS,SALON,BAKERY}_ID` | Sandbox merchant IDs for seed |
| `PAYPAL_CONNECTION_MODE` | `partner` or `byo` |
| `MERCHANT_{ROSAS,SALON,BAKERY}_CONNECTION_MODE` | Per-merchant mode override |
| `MERCHANT_{ROSAS,SALON,BAKERY}_CLIENT_ID`, `..._CLIENT_SECRET`, `..._WEBHOOK_ID` | BYO only; secret encrypted in DB |
| `KICKBACK_MASTER_KEY` | 32 random bytes in standard Base64; identity, encryption, tokens |
| `JOBS_BEARER` | At least 32 characters for operator APIs |
| `PG_POOL_MAX` | Web 5; cron 2 |
| `PAYPAL_RATE_PER_MIN` | 1–40, default 40; burst 10, per process |
| `KICKBACK_PAUSE_REWARDS` | Global environment kill switch |
| `REWARD_SETTLE_IMMEDIATE` | Default true; false leaves refunds to the sweep |
| `DEMO_MODE` | Enables sandbox tools; ordinary pay routes stay available |
| `KICKBACK_ALLOW_UNVERIFIED_WEBHOOKS` | Local simulator override only; false hosted |
| `PAYPAL_DEMO_VAULT_ID`, `MERCHANT_{ROSAS,SALON,BAKERY}_VAULT_ID` | Private saved sandbox wallet tokens |
| `REMOTE_JOBS_BEARER` | Hosted key for remote replay when different from local |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Optional AI configuration |
| `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY` | Applicable Studio deployment license |

## PayPal setup

1. Create a sandbox Platform app in [Apps & Credentials](https://developer.paypal.com/dashboard/applications/sandbox). Copy credentials privately. “Save payment methods” is the Vault feature. Enable Transaction Search and Custom disputes / Disputes API. Connecting a merchant requests `READ_SELLER_DISPUTE` and `UPDATE_SELLER_DISPUTE` alongside payment/refund access; an older grant must be approved again to add those permissions. Subscribing to dispute events alone does not grant merchant access.
2. Create US Business merchants and US Personal buyers. Sign into checkout with the sandbox buyer credentials.
3. Populate merchant account IDs. In partner mode, approve Partner Referrals consent as each merchant and verify granted features. A seed row alone does not grant consent.
4. Migrate and seed, then open `/pay/rosas`. `/dev/pay-test` remains a separate gated diagnostic page.
5. Register the public HTTPS webhook listener:

```powershell
npm run webhook:register -- https://your-app.onrender.com
```

6. Set the returned `PAYPAL_WEBHOOK_ID`. Local/hosted listeners need separate registrations. Real deliveries must log `verification_status: SUCCESS`. Enable Negative Testing on the relevant sandbox business account before mock checks.
7. For replay, approve saving a buyer's wallet and convert its setup token to a payment token. Store it privately. If PayPal rejects a platform token for a connected merchant, obtain a merchant-specific token.

## Render deployment

1. Create **kickback-shared** in the Render workspace before syncing the Blueprint. Add platform credentials, partner/BN/webhook IDs, `APP_URL`, merchant IDs, `KICKBACK_ENV=sandbox`, `PAYPAL_CONNECTION_MODE=partner`, `DEMO_MODE=true`, `KICKBACK_ALLOW_UNVERIFIED_WEBHOOKS=false`, `REWARD_SETTLE_IMMEDIATE=true`, and `PAYPAL_RATE_PER_MIN=40`.
2. Add one master key and job bearer. For an existing deployment, preserve its current values exactly. Only add merchant secrets when BYO mode is explicitly needed and authorized.
3. Choose **New → Blueprint**, select the GitHub repository and `render.yaml`, and supply initial web values when prompted. It links web/cron to the group and creates Postgres. Set the group's `DATABASE_URL` to the database's internal URL after creation. Existing deployments use their existing URL. The web `fromDatabase` value takes precedence.
4. Web pre-deploy runs migrations. Cron runs `npm run jobs` every five minutes with pool size 2. Web uses pool size 5 and a 60-second shutdown delay. Both require the same platform/master keys. Secrets never enter the YAML file.
5. Verify `/api/health` gives `ok: true`; `?deep=1` adds `db: "ok"`.
6. Seed through `POST /api/jobs/seed-demo` with `Authorization: Bearer <hosted JOBS_BEARER>`, then open `/pay/rosas`. This repeatable endpoint requires sandbox demo mode.
7. Check a sandbox purchase, refund, verified webhooks, buyer activity, and successful cron runs. Confirm Render credits in Billing; supplying a payment card alone does not establish a credit balance.

## Recovery and pause controls

`npm run pause -- rosas` / `npm run resume -- rosas` change the configured database's merchant switch; use `all` globally. Hosted equivalents are bearer-authenticated `POST /api/admin/merchants/rosas/pause` (or `resume`) and `/api/admin/rewards/pause` (or `resume`). An API request already accepted by PayPal can finish after a pause.

`POST /api/jobs/run` triggers recovery; `/api/jobs/purge` purges expired raw data. Sandbox-only `/api/jobs/inspect?merchant=rosas` returns minimized operator status. `/api/jobs/settle` supports refund mock/interrupted-result checks; adding `killProcess: true` with `interrupt: true` deliberately terminates the sandbox web process after an accepted refund result is discarded. Use it only during a controlled recovery check with no checkout in progress. `/api/jobs/replay-webhooks` replays already processed receipts. Every operator endpoint requires the bearer. There is no unauthenticated simulation API.

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run check:concurrency
npm run check:ledger
```

PGlite runs database unit tests; the concurrency and ledger checks use real Postgres. The ledger check exercises timestamp encoding, merging, and enqueue without provider calls. Before live use, establish provider approval, retention/consent decisions, and applicable deployment licenses. The current demo is sandbox-only.
