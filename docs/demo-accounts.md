# Demo accounts

Kickback's hosted demo runs entirely in PayPal sandbox. No real money moves, and every account below is a sandbox test account with test balances.

## Pay as a customer

1. Open the [demo page](https://kickback-web.onrender.com/demo) and choose **Get a demo buyer**. The page shows a sandbox buyer email and password and holds that buyer for you for 30 minutes.
2. Open [Rosa's Cafe](https://kickback-web.onrender.com/pay/rosas) and pick any item from $3.00.
3. Choose **PayPal** and sign in on `sandbox.paypal.com` with the buyer's details.
4. The thank-you screen shows visit 5 of 5 and the $2 reward. The refund appears in the buyer's sandbox activity with the cafe's thank-you note.

Each demo buyer is kept at 4 of 5 visits with recorded sandbox replay purchases on earlier days, so your payment is the fifth. Those earlier visits are labeled "Demo replay" everywhere in the merchant app. After a reward, a buyer rests until a background job prepares it again; the demo page always hands out one that is ready.

Please don't change a demo buyer's password or settings; other people use the same accounts.

### Venmo

Venmo is a US wallet. On a phone with the Venmo app installed, the Venmo button opens the app; on desktop it opens a web login, because the sandbox does not offer the QR code. If Venmo doesn't work where you are, use PayPal; the reward works the same way.

## Watch a reward happen

No account is needed. The demo page's **Start a live run** button makes one real sandbox payment for a demo customer at visit 4 of 5 and shows each step: the capture, the visit count, Guard's decision, the partial refund and PayPal's confirmation. Runs are limited per visitor and per day; when none can start, the page links to the most recent run instead.

## Explore the merchant app

**Explore read-only** on the demo page signs you in as a shared visitor of three demo businesses: Rosa's Cafe, Bright Salon and Loaf Bakery. You can open every page, filter the Cockpit, run backtests and ask the Analyst a few questions. Anything that would change a business, send money or message anyone is turned off. The visitor session ends after a day or when you choose **Leave demo**.

## Use your own sandbox business

See [Bring your own sandbox business](setup.md#bring-your-own-sandbox-business).
