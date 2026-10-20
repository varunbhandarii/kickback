/**
 * Merchant-facing words for every stored status, reason and source value.
 * Pages never print the raw values.
 */
export type Tone = "success" | "warn" | "info" | "danger" | "neutral" | "demo";

const warned = new Set<string>();
/** "SOME_VALUE" → "Some value". */
export function humanize(value: string) {
  const text = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function fallback(kind: string, value: string) {
  const key = `${kind}:${value}`;
  if (!warned.has(key) && process.env.NODE_ENV !== "test") {
    warned.add(key);
    console.warn(JSON.stringify({ action: "copy_fallback", kind, value }));
  }
  return humanize(value);
}

const rewardStates: Record<string, { label: string; tone: Tone }> = {
  EARNED: { label: "Earned", tone: "neutral" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  SENDING: { label: "Sending", tone: "info" },
  SENT: { label: "Sent", tone: "success" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  HELD: { label: "Needs review", tone: "warn" },
  DEFERRED: { label: "Waiting", tone: "info" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  OFFSET: { label: "Offset", tone: "neutral" },
};
export function rewardState(state: string) {
  return rewardStates[state] ?? { label: fallback("reward_state", state), tone: "neutral" as Tone };
}

const reasons: Record<string, string> = {
  REVIEW_APPROVED: "Approved by you",
  DECLINED: "Declined by you",
  REVIEW: "Waiting for your review",
  EXCLUDED: "Customer is marked as staff",
  BEFORE_PROGRAM_START: "Earned before the program started",
  PAUSED: "Rewards were paused",
  REWARDS_PAUSED_BEFORE_SEND: "Rewards were paused",
  DAILY_BUDGET: "Daily budget reached",
  MONTHLY_BUDGET: "Monthly budget reached",
  MONTHLY_CAP: "Customer's monthly limit reached",
  CUSTOMER_FROZEN: "Paused for a dispute",
  TRANSACTION_DISPUTED: "Paused for a dispute",
  FIXTURE_NOT_REFUNDABLE: "Demo visit, never paid",
  PENDING_CAPTURE: "Waiting for the payment to clear",
  PENDING_TOO_LONG: "The payment never cleared",
  TOO_OLD: "Too old to refund",
  REFUND_TIME_LIMIT_EXCEEDED: "Too old to refund",
  PARTIALLY_REFUNDED: "Nothing left to refund on that payment",
  REFUND_AMOUNT_EXCEEDED: "Nothing left to refund on that payment",
  NO_REFUNDABLE_CAPTURE: "Nothing left to refund on that payment",
  REFUND_NOT_PERMITTED_DUE_TO_CHARGEBACK: "Blocked by a chargeback",
  REFUND_FAILED_INSUFFICIENT_FUNDS: "Not enough PayPal balance",
  PARTIAL_REFUND_NOT_ALLOWED: "PayPal does not allow a partial refund on this payment",
  OFFSET_APPLIED: "Offset against an earlier return",
  STALE_CLAIM_RETRY: "Retrying automatically",
  DEFERRED_CREDIT_RETRY: "Retrying automatically",
  REFUND_CONFIRMATION_OVERDUE: "Retrying automatically",
  NEW_CAPTURE_AFTER_DEFINITIVE_REJECTION: "Moved to a newer payment",
};
/** Secondary line for a reward. Milestone reasons describe the reward kind instead. */
export function rewardReason(reason: string | null | undefined) {
  if (!reason || reason === "VISIT_MILESTONE" || reason === "SPEND_MILESTONE" || reason === "WIN_BACK")
    return "";
  return reasons[reason] ?? fallback("reward_reason", reason);
}

/** "5-visit reward", "$40 spent reward", "Welcome-back reward". */
export function rewardKind(
  kind: string | null | undefined,
  spec?: { type: string; n?: number; spendCents?: number },
) {
  if (kind === "WIN_BACK") return "Welcome-back reward";
  if (spec?.type === "VISIT_MILESTONE" && spec.n) return `${spec.n}-visit reward`;
  if (spec?.type === "SPEND_MILESTONE" && spec.spendCents)
    return `$${spec.spendCents % 100 === 0 ? spec.spendCents / 100 : (spec.spendCents / 100).toFixed(2)} spent reward`;
  return "Loyalty reward";
}

const tiers: Record<string, string> = {
  INSTANT: "sent right away",
  DELAYED: "waits 24 hours",
  REVIEW: "needs you",
};
export function guardTier(tier: string | null | undefined) {
  if (!tier) return "";
  return tiers[tier] ?? fallback("guard_tier", tier);
}
const decisions: Record<string, string> = {
  PENDING: "waiting for you",
  APPROVED: "approved by you",
  DECLINED: "declined by you",
  AUTO: "",
};
export function guardDecision(decision: string | null | undefined) {
  if (!decision) return "";
  return decisions[decision] ?? fallback("guard_decision", decision);
}

const customerStatuses: Record<string, { label: string; tone: Tone }> = {
  OK: { label: "Active", tone: "success" },
  FROZEN: { label: "Paused · dispute", tone: "info" },
  EXCLUDED: { label: "Staff", tone: "neutral" },
};
export function customerStatus(status: string) {
  return customerStatuses[status] ?? { label: fallback("customer_status", status), tone: "neutral" as Tone };
}

const merchantStatuses: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Rewards on", tone: "success" },
  PAUSED: { label: "Rewards paused", tone: "warn" },
  DISCONNECTED: { label: "Disconnected", tone: "danger" },
  ONBOARDING: { label: "Setting up", tone: "info" },
};
export function merchantStatus(status: string) {
  return merchantStatuses[status] ?? { label: fallback("merchant_status", status), tone: "neutral" as Tone };
}

const connectionModes: Record<string, string> = {
  PARTNER: "Connected through PayPal",
  BYO: "Using your own PayPal app",
};
export function connectionMode(mode: string | null | undefined) {
  if (!mode) return "Not connected";
  return connectionModes[mode] ?? fallback("connection_mode", mode);
}

const connectionStatuses: Record<string, { label: string; tone: Tone }> = {
  CONNECTED: { label: "Connected", tone: "success" },
  PENDING: { label: "Waiting for PayPal", tone: "info" },
  ACTION_REQUIRED: { label: "Action needed", tone: "warn" },
  DISCONNECTED: { label: "Disconnected", tone: "danger" },
  REVOKED: { label: "Access removed", tone: "danger" },
  FAILED: { label: "Couldn't verify", tone: "danger" },
};
export function connectionStatus(status: string | null | undefined) {
  if (!status) return { label: "Not connected", tone: "neutral" as Tone };
  return connectionStatuses[status] ?? { label: humanize(status), tone: "neutral" as Tone };
}

const sources: Record<string, string> = {
  PAY_PAGE: "Pay page",
  WEBHOOK: "PayPal",
  BACKFILL: "Imported history",
  REPLAY: "Demo replay",
  FIXTURE: "Demo data",
};
export function visitSource(source: string) {
  return sources[source] ?? fallback("visit_source", source);
}

export function wallet(value: string) {
  const v = value.toUpperCase();
  return v === "VENMO" ? "Venmo" : v === "PAYPAL" ? "PayPal" : humanize(value);
}

const categories: Record<string, string> = {
  cafe: "Cafe",
  bakery: "Bakery",
  salon: "Salon",
  other: "Other",
};
export function category(value: string) {
  return categories[value] ?? humanize(value);
}

const noticeKinds: Record<string, string> = {
  REFUND_RATIO: "Over guideline",
  GMV_RATIO: "Over guideline",
  DAILY_BUDGET: "Budget",
  REVIEW_OVERDUE: "Needs review",
  FROZEN: "Paused",
};
export function noticeKind(kind: string) {
  return noticeKinds[kind] ?? humanize(kind);
}
export function noticeTone(kind: string, severity: string): Tone {
  if (kind === "FROZEN") return "info";
  if (kind === "REVIEW_OVERDUE") return "warn";
  return severity === "warning" ? "warn" : "info";
}

/**
 * Points behind each Guard signal sentence, for showing why a reward was
 * held. Mirrors the weights in lib/guard/score.ts.
 */
const guardPoints: Record<string, number> = {
  "Three or more payments merged into the qualifying visit.": 40,
  "More than two visits today.": 25,
  "A new customer reached three visits in the first week.": 20,
  "Ticket exceeds ten times the usual visit amount.": 30,
  "Ticket exceeds three times the usual visit amount.": 15,
  "A previous reward has a clawback debit.": 30,
  "A previous reward was declined or held.": 10,
  "Two or more rewards in the last seven days.": 20,
  "Repeated tickets are close to the qualifying minimum.": 15,
  "Daily rewards exceed twice the backtested daily mean.": 15,
};
export function guardReasonPoints(reason: string): number | undefined {
  return guardPoints[reason];
}
