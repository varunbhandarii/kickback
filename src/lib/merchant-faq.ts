export const merchantFaq = [
  [
    "How much does Kickback cost?",
    "Free while Kickback runs in PayPal sandbox. No contract, no hardware, no customer app. Pricing for live merchants will be announced before launch.",
  ],
  [
    "How do rewards appear in reports?",
    "A reward is a partial refund linked to its original sale. The order custom field starts with KICKBACK:. Reconcile sales, refund identifiers and the annual rewards CSV against your PayPal reports. Fees retained on an original sale are generally not returned; check your PayPal fee agreement.",
  ],
  [
    "What about taxes and Form 1099-K?",
    "Form 1099-K reports gross payment volume, before adjustments such as refunds and fees. Reconcile your provider statements with the rewards CSV and accounting records. Kickback does not change collected sales tax. Merchants may book loyalty rewards as promotional expense; treatment of post-sale partial refunds and state sales tax varies. Ask your accountant which treatment fits your business. This is general information, not tax advice.",
  ],
  [
    "Are the refund limits approved by PayPal?",
    "No. Refund-count and revenue-share ceilings are Kickback design choices, not PayPal-approved thresholds. PayPal may treat a loyalty refund as a refund in its risk models. A sandbox success does not establish live approval.",
  ],
  [
    "What happens during a dispute?",
    "Eligibility pauses while a dispute is reviewed. Returned purchases may cancel unpaid rewards or offset a future reward. A loyalty reward does not replace a buyer's dispute rights or alter PayPal's resolution process. Merchants remain responsible for responding to cases.",
  ],
  [
    "What data is kept?",
    "Customer recognition uses a business-specific one-way code, visit amounts/dates and progress. There is no customer contact list. Disconnect stops new payments and future rewards immediately and schedules tenant payment/customer data and connection credentials for deletion within 48 hours. Raw webhooks expire after 47 hours; outages may delay physical cleanup. See Privacy for details.",
  ],
] as const;
