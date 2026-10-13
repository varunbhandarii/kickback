# Components and data handling

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

## Retention and operations

Raw payloads expire after 47 hours and are purged every five minutes; rows older than 48 hours trigger an alert. Outages can delay physical deletion. Minimal receipts and the pseudonymous ledger remain; data minimization does not establish a retention or marketing-use policy exemption.

Web and cron share hosted platform/database credentials through `kickback-shared`, preserving the master key. Pool limits are five/two. `/api/health` is DB-free; `?deep=1` checks Postgres. Structured logs record reward transitions and provider debug IDs without contact data. Checkout polls a one-hour signed reward token every two seconds for up to one minute; the worker continues after the tab closes.
