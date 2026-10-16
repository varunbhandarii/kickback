# Kickback API examples

Import `Kickback.postman_collection.json` and `kickback-sandbox.postman_environment.json` into Postman and select the `kickback-sandbox` environment. The collection has two folders: **PayPal sandbox** and **Kickback**.

Use local values or Vault for actual sandbox credentials. Shared environment values in these files are placeholders only. Never share or persist a client secret, access token, private webhook payload or session cookie. The OAuth script stores tokens as local execution variables, not collection/shared variables.

The PayPal examples require a connected sandbox merchant and appropriate scopes. After creating an order, approve it using a sandbox buyer in the browser before capture. Refund requests change test balances. Partner Referrals requires real seller approval; a sample request does not grant consent. Signature verification requires the exact original event and transmission headers.

For protected Kickback queries, sign in at `/sign-in`, select a business, and copy the complete Cookie request header into the **local** `kickback_session` value. Include both the session and merchant-selection cookies. Queries derive the tenant from this session; body fields cannot select another merchant.

To publish: create a public workspace and team profile, import the placeholder files, preview documentation for secrets, publish with the placeholder environment, and use Postman's generated **Markdown Run in Postman** link. Do not invent a collection UID or publish local credentials. Fork the official [PayPal APIs](https://www.postman.com/paypal) collection separately for reference.
