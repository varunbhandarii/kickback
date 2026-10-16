# Sandbox privacy

Kickback retains merchant-specific pseudonymous wallet keys, payment identifiers, visit progress, and reward states for the sandbox program. Provider account IDs are used in memory to derive keys, then discarded. Payer names, email addresses, phone numbers, and Venmo usernames are not stored in the loyalty ledger.

Raw webhook payloads expire after 47 hours and are purged every five minutes. Outages can delay physical deletion; rows older than 48 hours trigger an alert. Minimal event receipts remain for duplicate prevention. Pseudonymous keys remain linkable, so this is not a claim of anonymity or a retention-policy exemption.

No marketing is sent and no customer profiles are shared across merchants. Pay another way through the merchant to opt out; revoke sandbox permissions in PayPal settings to disconnect. Production retention, consent, provider approval, and contact details must be established before live use.

## Cockpit conversations

The Cockpit displays pseudonymous regular codes and business activity, with no payer contact information in its data sources. Analyst requests send program context, query/tool schemas and the selected business's pseudonymous or aggregate results to the configured AI provider. Secret API keys remain server-side. Avoid putting personal information or credentials in a question.

Conversations are scoped to their business, capped at 20 threads and deleted after 30 idle days. Assistant tool-turn cache entries expire after 24 hours. The retention job removes expired records; tenant purge also removes layouts, conversations, turn cache and digests. Operational token-usage logs contain no question or answer text.

## Data we keep

| Data                                                     | Purpose and retention                                                                                                                                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider payer ID                                        | Used in memory to derive the business-specific key; not retained in the loyalty ledger. It may occur in transient raw webhooks.                                                                                             |
| Pseudonymous key, wallets, visits, amounts and progress  | Business-specific recognition and eligibility, retained while connected; removed by scheduled tenant purge within 48 hours of disconnection.                                                                                |
| Orders, captures, rewards, refund IDs and disputes       | Settlement, reconciliation and duplicate protection; tenant ledger removed on purge.                                                                                                                                        |
| Raw signed webhook payload                               | Dispatch/recovery, expires after 47 hours; five-minute cleanup targets deletion within 48 hours.                                                                                                                            |
| Merchant sign-in, business configuration and memberships | Authentication and reconnection; retained separately from the customer/payment purge. API secrets are tenant-bound encrypted and deleted on purge.                                                                          |
| Audit and consent records                                | Operational accountability, up to 90 days; payment/customer identifiers are scrubbed on tenant purge.                                                                                                                       |
| Cockpit conversations                                    | Up to 20 threads per business, deleted after 30 idle days; tool-turn cache expires after 24 hours.                                                                                                                          |
| Analyst run counters, IDs and token/cost records         | Operational metrics, deleted after 90 days and on tenant purge. Counters contain no prompts, answers, tool arguments or results.                                                                                            |
| Weekly digests                                           | Business summaries, up to 90 days and removed on purge.                                                                                                                                                                     |
| Private progress link                                    | Signed bearer link valid for up to 365 days; renewed after recognized captures. Reveals aggregate progress, last-visit date and recent reward totals to anyone holding it, without login. No payer contacts or wallet type. |
| CSP reports, when enabled                                | Directive names and URL origins/paths go through a first-party relay to Sentry. Query strings, fragments, snippets, cookies and browser IP headers are not forwarded. Sentry retention is configured by the operator.       |

Scheduled cleanup can be delayed by outages. Pseudonymous codes and payment identifiers remain linkable; this is data minimization, not anonymity.
