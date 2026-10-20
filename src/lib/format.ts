import type { ProgramSpec } from "./engine/program";

/** "$2.00" — ledgers, tables and anything a merchant reconciles. */
export function money(cents: number) {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** "$2" when whole, "$2.50" otherwise — program promises and headlines. */
export function moneyShort(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${abs % 100 === 0 ? abs / 100 : (abs / 100).toFixed(2)}`;
}

function validTz(tz?: string) {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function yearOf(date: Date, tz: string) {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(date),
  );
}

/** "Oct 17, 10:55 PM" (adds the year outside the current one). */
export function when(date: Date | string | number, tz?: string, now = new Date()) {
  const d = new Date(date);
  const zone = validTz(tz);
  const sameYear = yearOf(d, zone) === yearOf(now, zone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** "Oct 17" or "Oct 17, 2025". */
export function day(date: Date | string | number, tz?: string, now = new Date()) {
  const d = new Date(date);
  const zone = validTz(tz);
  const sameYear = yearOf(d, zone) === yearOf(now, zone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

function localDayNumber(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return Math.round(Date.parse(`${parts}T00:00:00Z`) / 86400000);
}

/** "Today", "Yesterday", "3 days ago", then the date. */
export function lastSeen(date: Date | string | number, tz?: string, now = new Date()) {
  const zone = validTz(tz);
  const diff = localDayNumber(now, zone) - localDayNumber(new Date(date), zone);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return day(date, zone, now);
}

/** "1.8%" from a ratio. */
export function pct(ratio: number, digits = 1) {
  if (!Number.isFinite(ratio)) return "0%";
  const value = ratio * 100;
  const fixed = value.toFixed(digits);
  return `${fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed}%`;
}

/** "#A1B2" — the public, business-specific customer code. */
export function customerCode(key: string) {
  return `#${key.slice(0, 4).toUpperCase()}`;
}

/** Short program promise: "Every 5th visit, $2 back". */
export function programHeadline(s: ProgramSpec) {
  return s.type === "VISIT_MILESTONE"
    ? `Every ${ordinal(s.n)} visit, ${moneyShort(s.rewardCents)} back`
    : `${moneyShort(s.rewardCents)} back for every ${moneyShort(s.spendCents)} you spend`;
}

/** Sign headline: "5 visits. $2 back." */
export function signHeadline(s: ProgramSpec) {
  return s.type === "VISIT_MILESTONE"
    ? [`${s.n} visits.`, `${moneyShort(s.rewardCents)} back.`]
    : [`${moneyShort(s.spendCents)} spent.`, `${moneyShort(s.rewardCents)} back.`];
}

/** "every 5 visits within 60 days, $2 back" for merchant-facing summaries. */
export function ruleShort(s: ProgramSpec) {
  return s.type === "VISIT_MILESTONE"
    ? `${s.n} visits within ${s.windowDays} days → ${moneyShort(s.rewardCents)} back`
    : `${moneyShort(s.spendCents)} spent within ${s.windowDays} days → ${moneyShort(s.rewardCents)} back`;
}

export function ordinal(n: number) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "120 minutes" → "2 hours" when it divides evenly. */
export function minutesInWords(min: number) {
  if (min >= 60 && min % 60 === 0) {
    const h = min / 60;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${min} minute${min === 1 ? "" : "s"}`;
}
