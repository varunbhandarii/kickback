import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  customerCode,
  day,
  lastSeen,
  minutesInWords,
  money,
  moneyShort,
  ordinal,
  pct,
  programHeadline,
  signHeadline,
  when,
} from "@/lib/format";
import {
  customerStatus,
  guardReasonPoints,
  humanize,
  rewardKind,
  rewardReason,
  rewardState,
  wallet,
} from "@/lib/copy";
import { scoreGuard, type GuardFeatures } from "@/lib/guard/score";
import { defaultProgram, loadProgram } from "@/lib/engine/program";
import { darkParams, lightParams } from "@/lib/studio/theme";

describe("format", () => {
  it("formats money for ledgers and headlines", () => {
    expect(money(200)).toBe("$2.00");
    expect(money(-450)).toBe("-$4.50");
    expect(moneyShort(200)).toBe("$2");
    expect(moneyShort(250)).toBe("$2.50");
  });
  it("names ordinals and durations", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
    expect(minutesInWords(120)).toBe("2 hours");
    expect(minutesInWords(60)).toBe("1 hour");
    expect(minutesInWords(45)).toBe("45 minutes");
  });
  it("writes program promises", () => {
    const visit = loadProgram(defaultProgram);
    expect(programHeadline(visit)).toBe("Every 5th visit, $2 back");
    expect(signHeadline(visit)).toEqual(["5 visits.", "$2 back."]);
    const spend = loadProgram({ ...defaultProgram, type: "SPEND_MILESTONE", spendCents: 4000, rewardCents: 300 });
    expect(programHeadline(spend)).toBe("$3 back for every $40 you spend");
  });
  it("formats dates in the business time zone", () => {
    const now = new Date("2026-10-18T15:00:00Z");
    expect(when(new Date("2026-10-17T22:55:00Z"), "UTC", now)).toBe("Oct 17, 10:55 PM");
    expect(day(new Date("2025-03-02T12:00:00Z"), "UTC", now)).toBe("Mar 2, 2025");
    expect(lastSeen(new Date("2026-10-18T09:00:00Z"), "UTC", now)).toBe("Today");
    expect(lastSeen(new Date("2026-10-17T09:00:00Z"), "UTC", now)).toBe("Yesterday");
    expect(lastSeen(new Date("2026-10-15T09:00:00Z"), "UTC", now)).toBe("3 days ago");
  });
  it("shortens codes and ratios", () => {
    expect(customerCode("a1b2c3d4")).toBe("#A1B2");
    expect(pct(0.018)).toBe("1.8%");
  });
});

describe("copy", () => {
  it("never prints a stored value as is", () => {
    expect(rewardState("HELD")).toEqual({ label: "Needs review", tone: "warn" });
    expect(rewardState("SOME_NEW_STATE").label).toBe("Some new state");
    expect(rewardReason("VISIT_MILESTONE")).toBe("");
    expect(rewardReason("DAILY_BUDGET")).toBe("Daily budget reached");
    expect(rewardKind("WIN_BACK")).toBe("Welcome-back reward");
    expect(rewardKind("REGULAR", defaultProgram)).toBe("5-visit reward");
    expect(customerStatus("FROZEN").label).toBe("Paused · dispute");
    expect(wallet("VENMO")).toBe("Venmo");
    expect(humanize("REFUND_FAILED")).toBe("Refund failed");
  });
  it.each<[string, Partial<GuardFeatures>]>([
    ["merged payments", { mergedCaptures: 3 }],
    ["visits today", { visitsToday: 3 }],
    ["fast new customer", { customerAgeDays: 2, completedVisits: 3 }],
    ["large ticket", { ticketCents: 2000 }],
    ["very large ticket", { ticketCents: 6000 }],
    ["clawback", { priorClawback: true }],
    ["earlier hold", { priorDeclinedOrHeld: true }],
    ["recent rewards", { rewardsLast7Days: 2 }],
    ["tickets near the minimum", { ticketCents: 320, visitsToday: 2 }],
    ["daily burn", { dayBudgetBurnCents: 300 }],
  ])("shows the points Guard adds for %s", (_, change) => {
    const quiet: GuardFeatures = {
      mergedCaptures: 1,
      visitsToday: 1,
      customerAgeDays: 30,
      completedVisits: 1,
      ticketCents: 500,
      medianTicketCents: 500,
      priorClawback: false,
      priorDeclinedOrHeld: false,
      rewardsLast7Days: 0,
      minTicketCents: 300,
      dayBudgetBurnCents: 0,
      simulatedDailyMeanCents: 100,
    };
    const { score, reasons } = scoreGuard({ ...quiet, ...change });
    expect(reasons).toHaveLength(1);
    expect(guardReasonPoints(reasons[0])).toBe(score);
  });
});

describe("Studio theme", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const block = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    const body = css.slice(start, css.indexOf("}", start));
    return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]));
  };
  const pairs: [keyof typeof lightParams, string][] = [
    ["accentColor", "forest"],
    ["backgroundColor", "surface"],
    ["foregroundColor", "ink"],
    ["subtleTextColor", "ink-3"],
    ["iconColor", "ink-2"],
    ["borderColor", "line"],
    ["rowHoverColor", "surface-2"],
    ["studioCanvasBackgroundColor", "canvas"],
    ["chartGridLineColor", "grid"],
    ["chartAxisLineColor", "line-strong"],
  ];
  it.each([
    ["light", ":root", lightParams],
    ["dark", ':root[data-theme="dark"]', darkParams],
  ] as const)("matches the %s tokens", (_, selector, params) => {
    const tokens = block(selector);
    for (const [param, token] of pairs) expect([param, String(params[param]).toLowerCase()]).toEqual([param, tokens[token]]);
  });
});
