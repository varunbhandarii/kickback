import { PayPalApiError } from "../paypal/client";
export function refundFailure(error: unknown, attempts: number) {
  if (error instanceof Error && error.message === "REWARDS_PAUSED_BEFORE_SEND") return { state: "SCHEDULED" as const, reason: "PAUSED", delayMs: 5*60000 };
  const issue = error instanceof PayPalApiError ? error.details[0]?.issue ?? error.name : "NETWORK";
  const debugId = error instanceof PayPalApiError ? error.debug_id : undefined;
  if (["TRANSACTION_DISPUTED","REFUND_NOT_PERMITTED_DUE_TO_CHARGEBACK"].includes(issue)) return { state: "HELD" as const, reason: issue, freeze: true, debugId };
  if (["REFUND_AMOUNT_EXCEEDED","CAPTURE_FULLY_REFUNDED","PARTIAL_REFUND_NOT_ALLOWED","MAX_NUMBER_OF_REFUNDS_EXCEEDED"].includes(issue)) return { state: "DEFERRED" as const, reason: issue, fallback: true, debugId };
  if (issue === "REFUND_TIME_LIMIT_EXCEEDED") return { state: "CANCELLED" as const, reason: "TOO_OLD", debugId };
  if (issue === "PENDING_CAPTURE") return { state: "SCHEDULED" as const, reason: issue, delayMs: 15*60000, debugId };
  if (issue === "REFUND_FAILED_INSUFFICIENT_FUNDS") return { state: "SCHEDULED" as const, reason: issue, delayMs: 6*3600000, debugId };
  const transient = !(error instanceof PayPalApiError) || [409,429].includes(error.status) || error.status >= 500;
  if (transient && attempts < 8) return { state: "SCHEDULED" as const, reason: issue, delayMs: Math.min(60,2**attempts)*60000, debugId };
  return { state: "FAILED" as const, reason: issue, debugId };
}
