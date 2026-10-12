# Components and data handling

Next.js serves the application and the PayPal webhook endpoint. The PayPal REST client caches OAuth tokens, serializes requests at 1.5-second intervals per process, and retries transient failures with the same request ID. Merchant assertions use standard Base64 and the trailing empty signature.

The webhook receiver submits the complete received JSON and transmission headers to PayPal's signature verification endpoint. It writes a receipt and raw event in a single Postgres transaction. The event ID primary key makes concurrent duplicates no-ops. Storage and verification outages return 503 so PayPal can retry.

Only event type, event ID, resource ID, status and verification outcome are logged. Raw payloads receive a 48-hour expiration timestamp. A cron runs every 15 minutes to delete expired payloads; physical retention can therefore exceed the timestamp by one cron interval. Event receipt IDs remain for deduplication. Use a shorter retention period or more frequent purge if a strict physical 48-hour ceiling is required.

Sandbox checkout is disabled by default. Orders use server-selected merchant credentials and a signed capture context. A capture retry reuses its original idempotency key. BYO checkout passes that merchant's app ID to the browser. Keys and client secrets stay server-side.

The dashboard demonstrates AG Studio with synthetic rows. Program Designer schemas and local range checks are available; the application does not yet calculate or pay loyalty rewards.
