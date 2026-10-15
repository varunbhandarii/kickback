# Sandbox privacy

Kickback retains merchant-specific pseudonymous wallet keys, payment identifiers, visit progress, and reward states for the sandbox program. Provider account IDs are used in memory to derive keys, then discarded. Payer names, email addresses, phone numbers, and Venmo usernames are not stored in the loyalty ledger.

Raw webhook payloads expire after 47 hours and are purged every five minutes. Outages can delay physical deletion; rows older than 48 hours trigger an alert. Minimal event receipts remain for duplicate prevention. Pseudonymous keys remain linkable, so this is not a claim of anonymity or a retention-policy exemption.

No marketing is sent and no customer profiles are shared across merchants. Pay another way through the merchant to opt out; revoke sandbox permissions in PayPal settings to disconnect. Production retention, consent, provider approval, and contact details must be established before live use.

## Cockpit conversations

The Cockpit displays pseudonymous regular codes and business activity, with no payer contact information in its data sources. Analyst requests send program context, query/tool schemas and the selected business's pseudonymous or aggregate results to the configured AI provider. Secret API keys remain server-side. Avoid putting personal information or credentials in a question.

Conversations are scoped to their business, capped at 20 threads and deleted after 30 idle days. Assistant tool-turn cache entries expire after 24 hours. The retention job removes expired records; tenant purge also removes layouts, conversations, turn cache and digests. Operational token-usage logs contain no question or answer text.
