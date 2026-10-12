# Sandbox privacy

Kickback retains merchant-specific pseudonymous wallet keys, payment identifiers, visit progress, and reward states for the sandbox program. Provider account IDs are used in memory to derive keys, then discarded. Payer names, email addresses, phone numbers, and Venmo usernames are not stored in the loyalty ledger.

Raw webhook payloads expire after 47 hours and are purged every five minutes. Outages can delay physical deletion; rows older than 48 hours trigger an alert. Minimal event receipts remain for duplicate prevention. Pseudonymous keys remain linkable, so this is not a claim of anonymity or a retention-policy exemption.

No marketing is sent and no customer profiles are shared across merchants. Pay another way through the merchant to opt out; revoke sandbox permissions in PayPal settings to disconnect. Production retention, consent, provider approval, and contact details must be established before live use.
