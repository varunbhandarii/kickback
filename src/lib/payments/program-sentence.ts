import type { ProgramSpec } from "../engine/program";
export function programSentence(s: ProgramSpec, name: string) {
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const threshold =
    s.type === "VISIT_MILESTONE"
      ? `${s.n} qualifying visits`
      : `${money(s.spendCents)} in qualifying purchases`;
  const line = ` regulars: ${threshold} within ${s.windowDays} days earns a ${money(s.rewardCents)} loyalty reward as a partial refund. PayPal or Venmo; limits apply. Terms at the link.`;
  return name.slice(0, Math.max(0, 250 - line.length)) + line;
}
