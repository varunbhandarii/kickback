import { customerKey } from "../crypto/tenant";
import { parseCents } from "../ledger/record-capture";
export const transactionFingerprint = (merchantId: string, id: string) =>
  customerKey(merchantId, `history-transaction:${id}`);
export const historyEventKey = (merchantId: string, id: string, code: string) =>
  `${transactionFingerprint(merchantId, id)}.${customerKey(merchantId, `history-code:${code}`)}`;

export type SearchRow = {
  transaction_info?: {
    transaction_id?: string;
    transaction_event_code?: string;
    transaction_status?: string;
    transaction_initiation_date?: string;
    transaction_amount?: { value: string; currency_code: string };
    fee_amount?: { value: string };
    paypal_reference_id?: string;
    paypal_reference_id_type?: string;
    custom_field?: string;
    instrument_type?: string;
  };
  payer_info?: { account_id?: string };
};
export const saleCodes = [
  "T0000",
  "T0002",
  "T0003",
  "T0005",
  "T0006",
  "T0007",
  "T0011",
  "T0012",
  "T0018",
  "T0019",
] as const;
const sales = new Set<string>(saleCodes);
const refunds = new Set(["T1107", "T1120", "T1106", "T1100", "T1116", "T1118"]);
const chargebacks = new Set(["T1201", "T1207"]),
  undo = new Set(["T1202", "T1205", "T1208"]);
export type HistoryItem = {
  key: string;
  id: string;
  kind: "SALE" | "UNRECOGNIZED" | "REFUND" | "CHARGEBACK" | "UNDO";
  at: Date;
  amount: number;
  fee: number;
  customerKey?: string;
  wallet: "PAYPAL" | "VENMO";
  reference?: string;
  rewardId?: string;
};
export function classify(
  merchantId: string,
  row: SearchRow,
): HistoryItem | undefined {
  const t = row.transaction_info;
  if (
    !t?.transaction_id ||
    !t.transaction_event_code ||
    t.transaction_status !== "S" ||
    t.transaction_amount?.currency_code !== "USD"
  )
    return;
  const at = new Date(t.transaction_initiation_date ?? "");
  if (!Number.isFinite(at.getTime())) return;
  const kind = sales.has(t.transaction_event_code)
    ? "SALE"
    : refunds.has(t.transaction_event_code)
      ? "REFUND"
      : chargebacks.has(t.transaction_event_code)
        ? "CHARGEBACK"
        : undo.has(t.transaction_event_code)
          ? "UNDO"
          : undefined;
  if (!kind || !/^[A-Za-z0-9_-]{1,64}$/.test(t.transaction_id)) return;
  let amount: number,
    fee = 0;
  try {
    amount = parseCents(t.transaction_amount.value.replace(/^-/, ""));
    if (t.fee_amount) fee = parseCents(t.fee_amount.value.replace(/^-/, ""));
  } catch {
    return;
  }
  if (
    !amount ||
    (kind === "SALE" && t.transaction_amount.value.startsWith("-"))
  )
    return;
  const key = historyEventKey(
    merchantId,
    t.transaction_id,
    t.transaction_event_code,
  );
  // Payer contacts are deliberately outside this type and are never inspected.
  const person =
    kind === "SALE" && row.payer_info?.account_id?.trim()
      ? customerKey(merchantId, row.payer_info.account_id)
      : undefined;
  const reference =
    t.paypal_reference_id_type === "TXN" &&
    /^[A-Za-z0-9_-]{1,64}$/.test(t.paypal_reference_id ?? "")
      ? t.paypal_reference_id
      : undefined;
  const rewardId = /^KICKBACK:R:[0-9a-f-]{36}$/i.test(t.custom_field ?? "")
    ? t.custom_field!.slice(11)
    : undefined;
  return {
    key,
    id: t.transaction_id,
    kind: kind === "SALE" && !person ? "UNRECOGNIZED" : kind,
    at,
    amount,
    fee,
    customerKey: person,
    wallet: t.instrument_type?.toUpperCase() === "VENMO" ? "VENMO" : "PAYPAL",
    reference,
    rewardId,
  };
}
export function historyWindows(from: Date, to: Date) {
  const windows: { from: Date; to: Date }[] = [];
  let start = from.getTime();
  while (start < to.getTime()) {
    const end = Math.min(start + 31 * 86400000, to.getTime());
    windows.push({ from: new Date(start), to: new Date(end) });
    if (end === to.getTime()) break;
    start = end - 86400000;
  }
  return windows;
}
