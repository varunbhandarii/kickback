# Components and data handling

## Merchant accounts and onboarding

Better Auth uses database sessions and scrypt passwords. The proxy checks cookie presence for `/m/*`; the data-access layer independently checks the session, its absolute 30-day age, and owner membership on every page and mutation. Per-IP and per-email sign-in limits return generic errors. Optional email verification, hashed single-use sign-in tokens, password resets, and inbox-bound co-owner invitations use the merchant sender. OAuth access/refresh tokens are encrypted.

Business creation writes an onboarding merchant, owner membership, and draft program. Partner callbacks map by a server-stored tracking ID and re-query PayPal's integration API; hints cannot mark a seller connected. Webhooks trigger the same truth lookup. BYO validates OAuth scopes, optionally verifies the merchant account through reporting, registers/reuses an app-specific webhook, and stores the secret with AES-GCM bound to the tenant ID. Connection attempts use a nonce so disconnect cancels in-progress setup.

## Sales history and reconciliation

The history worker reads at most 90 days in 31-day windows with one-day overlap, 500 rows per page, and a 20-page window limit. A durable cursor, heartbeat, and lease allow the 45-second worker to resume safely. Successful USD sale/refund/chargeback codes are classified in memory. Account IDs become tenant HMACs immediately; payer contacts, descriptions, and raw Search responses are neither logged nor stored. Guest sales keep only derived count/deduplication markers and create no customer, order, or capture row.

Recognized new sales create synthetic orders, captures, and merged visits. Transaction/event markers deduplicate overlaps independently of capture identity; known captures and their recorded wallets are preserved. Unordered refunds and risk events wait in normalized receipts until their sale is available. Existing rewarded cycles are protected when bridging visit groups. Completion calculates progress once per customer and refreshes aggregate business statistics. Milestones before program activation or within an initial history import are consumed without payments; that import boundary remains durable after retries and completion.

Every six hours, eligible active businesses reconcile the last 48 hours using the same importer. External sales can earn rewards after activation. Earned refunds rematch by refund/custom IDs without a second balance debit; foreign refunds retain the existing clawback rules. Missing report matches raise an attention marker without changing a sent reward's state. Reporting lag may be three hours.

Disconnect and consent revocation pause checkout/rewards, cancel queued rewards and imports, invalidate connection attempts, and schedule tenant deletion. Purge removes ledger and connection credentials in dependency order, clears business statistics, and scrubs audit identifiers while retaining business configuration and owner membership for reconnection. Order fingerprints expire after seven days; audit records after 90 days. Account deletion requires recent authentication, confirms a password when present, revokes sessions/memberships, and disconnects businesses losing their last owner; other co-owners retain access.

Next.js serves checkout, terms, signs, status polling, and webhooks. Postgres stores merchants, encrypted BYO connections, versioned programs, pseudonymous customers, orders, captures, visits, rewards, offsets, refund receipts, dispute cases, and an audit log.

## Recognition and rules

Order creation resolves menu prices on the server and reserves a purchase fingerprint per UUID. Signed order context binds merchant, slug, wallet, amount, order, and UUID. PayPal and Venmo provider account IDs derive the same merchant-specific HMAC key when they identify the same wallet; the provider ID is discarded after derivation.

Capture responses identify the wallet. GET-order recovery preserves an already recorded wallet; for the first capture it uses the authenticated checkout reservation because a later GET can normalize a Venmo-funded order to PayPal. An authoritative capture response can correct earlier metadata without creating another customer or visit.

Transactions acquire merchant and then customer advisory locks, protecting shared budgets and visit merging. Captures within the merge window attach to one visit. Pending captures never earn rewards. Terminal states never regress from a late pending event.

The pure engine supports visit/spend milestones, integer cents, inclusive merchant-local calendar windows, monthly customer caps, and merchant budgets. Consumed milestones remain cycle boundaries after a return. Rewards record contributing visit IDs so returns anywhere in a cycle can claw them back.

## Durable settlement

The capture transaction inserts a reward with a unique visit and PayPal request UUID. `after()` attempts immediate settlement; cron recovers work every five minutes. A short `FOR UPDATE SKIP LOCKED` transaction claims `SCHEDULED → SENDING`; the API call runs outside the transaction. A stale ten-minute claim retries the same capture and UUID. Queueing, fetches, and retries honor a worker deadline.

Pending refunds become `SENT`; completed provider results become `CONFIRMED`. Verified events confirm independently. Refunds pending for over seven days become `HELD` for review. Provider errors cancel, defer, hold, or fail; transient errors retry the same operation. Retargeting to another capture after a definitive rejection creates a new persisted UUID. Uncertain requests never silently retarget.

Clawback debits and deferred credits have distinct kinds. Gross rewards stay positive; offsets reduce payable amounts and can produce `OFFSET` without an API call. Foreign refunds adjust eligibility. Invalidated cycles cancel unpaid rewards or create a debit once for paid rewards. Disputes freeze the customer; all cases must resolve for the seller before automatic unfreezing. Revoked consent pauses checkout and rewards.

A returned cycle also restores any debt its reward had offset. A paid or fully offset cycle restores the gross benefit; a cancelled unpaid reward restores only the offset it consumed. Duplicate returns cannot restore that debt twice. Dispute resolution releases rewards held during the case, while a reversed capture keeps the customer frozen.

## Webhooks and transport

Signature verification uses original bytes, CRC32, and RSA-SHA256. Certificates are cached and fetched only from exact PayPal HTTPS API hosts and certificate paths; failures fall back to PayPal postback. Receipt and raw payload commit together. Processing claims, attempts, errors, and completion are separate from event-ID deduplication; the worker retries incomplete dispatch.

Refunds match their stored ID first, then a reward custom ID. Unidentified events on a capture with an uncertain request wait for the API result, avoiding false clawbacks. Refund receipts debit once regardless of event/API ordering. Unknown captures are enriched through the connected merchant's order API.

OAuth tokens are cached. High/normal/low priority lanes pace every PayPal request: burst 10, refill 40/minute **per process**, not across the fleet. Pay routes use in-memory rate limits, origin checks, and HMAC tokens. Operator APIs require the job bearer; replay and fault checks also require sandbox demo mode.

The webhook listener accepts the platform registration and configured merchant registration IDs from `connections.webhook_id`. It verifies signatures against those server-side IDs; callers cannot supply a trusted registration. Platform deliveries keep the local-verification fast path. Merchant-owned deliveries can be verified locally with PayPal's certificate without uploading merchant app credentials.

## Retention and operations

Raw payloads expire after 47 hours and are purged every five minutes; rows older than 48 hours trigger an alert. Outages can delay physical deletion. Minimal receipts and the pseudonymous ledger remain; data minimization does not establish a retention or marketing-use policy exemption.

Web and cron share hosted platform/database credentials through `kickback-shared`, preserving the master key. Pool limits are five/two. `/api/health` is DB-free; `?deep=1` checks Postgres. Structured logs record reward transitions and provider debug IDs without contact data. Checkout polls a one-hour signed reward token every two seconds for up to one minute; the worker continues after the tab closes.

## Cockpit and analyst

`/m/cockpit` loads AG Studio in a separate client-only chunk. Overview and checkout do not import Studio. Its six async tables expose tenant-scoped customer codes, visits, rewards, zero-filled daily summaries, monthly cohorts and Analyst usage; payer identities and raw webhook payloads are not sources. Query requests authenticate the owner, derive the business from the session/cookie, validate every field/operator and push filtering, sorting and bounded pages into PostgreSQL. Unknown filters fail explicitly.

Layouts are size-capped, saved per business and resettable. Invalid state falls back safely. Reward Funnel and Customer Ledger use React/SVG and the same data engine and cross-filters. Synthetic/replay history is labeled; synthetic captures are never refundable.

The Analyst uses the existing scoped metrics, risk, customer, simulation and design tools. API routes overwrite any supplied merchant ID with the authenticated actor. Studio page/widget agents handle chart layout. No model tool can approve a reward, issue a refund, message a customer, resolve a dispute or activate a program.

The server maps Claude's stream to AG-UI events and a final completion envelope. It enforces a separate daily Analyst quota and records token usage without prompts. Tenant-scoped assistant tool-turn content is retained for up to 24 hours so subsequent tool results can replay signed thinking correctly. Conversations retain at most20 threads per business and expire after 30 idle days. The retention job and tenant purge remove these records; approved financial records retain their existing lifecycle.

Sunday digests are deterministic in-app summaries. Optional welcome-back rewards are owner-activated rules; they use the ordinary Guard, budgets, caps and refund executor, with regular milestones taking precedence.

## Customer awareness and merchant reporting

Each order includes one receipt item with the menu/payment name, deterministic program sentence, terms URL, quantity and matching item-total breakdown. No payer personalization is sent before approval. Newly activated thank-you notes must include “loyalty reward”; previously approved versions remain unchanged.

Recognized captures issue a merchant-bound HMAC progress link under a derived key. Verification checks length, signature, issue time, expiry, active merchant/program and token/visitor rate limits. The no-login page has no-store/noindex headers and exposes a summary. Annual rewards CSV streams up to 50,000 rows for the selected owner's business with spreadsheet-formula escaping.

Loyalty and Risk are separate saved pages. Risk includes a weekday-by-wallet pivot with totals, review grid, ledger and usage cards. Inline tool details persist with chat results. Browser observers record run/turn/tool counts only; tokens and costs come from server ai_calls, linked by validated trace IDs. Metadata expires after 90 days. Cohorts exclude FIXTURE history and label REPLAY; recent cohorts have incomplete follow-up and no causal interpretation.

## Workflow reconciliation

The optional kickback-workflows service fans out one reconciliation task per eligible connected merchant. It shares existing import checkpoints, locks and leases with cron. Cron triggers a UTC-day idempotency key and remains the recovery fallback. Tasks have bounded deadlines/retries and pass merchant IDs rather than ledger payloads. Database migrations run only on the web service. A bearer-protected admin endpoint can trigger the same daily run. Weekly digest tasks use the deterministic/idempotent digest implementation.
