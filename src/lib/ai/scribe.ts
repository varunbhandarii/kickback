import { rewardNote as rewardNoteForValidation } from "../engine/program";
import { generateNotes } from "./scribe-notes";
import { z } from "zod";
import {
  aiEnabled,
  dataBlock,
  structured,
  type StructuredCaller,
} from "./client";
import type { ProgramSpec } from "../engine/program";
export const milestoneText = (s: ProgramSpec) =>
  s.type === "VISIT_MILESTONE"
    ? s.n + " visits"
    : "$" + (s.spendCents / 100).toFixed(2) + " spent";
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const denied =
  /\b(discounts?|offers?|sales?|coupons?|codes?|limited|refer\w*|net)\b|%\s*off|effectively\s*\$|guarantee|promise|will arrive|instantly/i;
export function copyValid(
  text: string,
  max: number,
  merchant: string,
  spec: ProgramSpec,
  options: { milestone?: boolean; notes?: boolean; items?: string[] } = {},
) {
  if (
    !text ||
    text.length > max ||
    /[\r\n]|https?:|www\.|\b\w+\.(com|net|org)\b/i.test(text)
  )
    return false;
  const body = text.replaceAll(merchant, "");
  if (denied.test(body)) return false;
  const free = body.match(/\bfree\b[^.,;!]*/gi) ?? [];
  if (
    free.some(
      (piece) =>
        !(options.items ?? []).some((item) =>
          new RegExp("^free\\s+" + escape(item) + "\\b", "i").test(piece),
        ),
    )
  )
    return false;
  const emojis = [...body.matchAll(/\p{Extended_Pictographic}/gu)];
  if (emojis.length > 1) return false;
  const ascii = body.replace(/\p{Extended_Pictographic}/gu, "");
  if (/[^\x20-\x7e]/.test(ascii)) return false;
  if (
    options.notes &&
    (!text.includes(merchant) ||
      !text.includes(milestoneText(spec)) ||
      !/loyalty reward/i.test(text))
  )
    return false;
  if (options.milestone && !text.includes(milestoneText(spec))) return false;
  const allowed = new Set<number>([
    spec.rewardCents / 100,
    spec.windowDays,
    spec.minTicketCents / 100,
    spec.perCustomerMonthlyCapCents / 100,
    spec.dailyBudgetCents / 100,
    spec.monthlyBudgetCents / 100,
    spec.mergeWindowMin,
    ...(spec.type === "VISIT_MILESTONE"
      ? [spec.n, spec.endowedProgress ?? 0]
      : [spec.spendCents / 100]),
  ]);
  if (
    (body.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).some(
      (n) => !allowed.has(Number(n.replaceAll(",", ""))),
    )
  )
    return false;
  if (options.notes) {
    const allowedMoney = [
      spec.rewardCents / 100,
      ...(spec.type === "SPEND_MILESTONE" ? [spec.spendCents / 100] : []),
    ];
    if (
      (body.match(/\$\d[\d,]*(?:\.\d+)?/g) ?? []).some(
        (n) => !allowedMoney.includes(Number(n.replace(/[$,]/g, ""))),
      )
    )
      return false;
  }
  return true;
}
export function templateNotes(name: string, spec: ProgramSpec) {
  const milestone = milestoneText(spec);
  return [
    `Thanks for ${milestone}: a loyalty reward from ${name}.`,
    `${name}: a loyalty reward for ${milestone}. Thank you!`,
    `${milestone} at ${name}. Enjoy your loyalty reward.`,
    `${name} thanks you for ${milestone} with a loyalty reward.`,
    `A loyalty reward from ${name} for ${milestone}.`,
    `Cheers from ${name}: your loyalty reward for ${milestone}.`,
  ].filter((note) => copyValid(note, 120, name, spec, { notes: true }));
}
export function templateCopy(name: string, spec: ProgramSpec) {
  const rule = milestoneText(spec),
    reward = "$" + (spec.rewardCents / 100).toFixed(2);
  const pitch = `Regulars get ${reward} back after ${rule}.`;
  return {
    termsIntro: "A small thank-you for coming back.",
    workedExamples: [
      `After ${rule} within ${spec.windowDays} days, an eligible purchase can receive a ${reward} partial refund, subject to limits.`,
      `The next ${rule} starts a new cycle under the same limits. Returned or disputed purchases can forfeit eligibility.`,
    ],
    signPitch: pitch,
  };
}

const Copy = z.strictObject({
  termsIntro: z.string(),
  workedExamples: z.array(z.string()).length(2),
  signPitch: z.string(),
});
export async function generateScribe(
  merchantId: string,
  name: string,
  voiceHints: string,
  spec: ProgramSpec,
  items: string[] = [],
  caller: StructuredCaller = structured,
) {
  const notes = await generateNotes(
      merchantId,
      name,
      voiceHints,
      spec,
      items,
      caller,
    ),
    calls = [...notes.aiCallIds];
  let copy = templateCopy(name, spec),
    copyFallback = true,
    correction = "";
  if (aiEnabled())
    for (let attempt = 0; attempt < 2; attempt++)
      try {
        const response = await caller({
          merchantId,
          feature: "scribe.copy",
          system:
            "Write a brief positive intro, preferably one sentence (400 characters max), two worked examples (240 characters each), and sign pitch (90 characters max). The application supplies all fixed legal terms; do not write disclaimers or repeat those terms in the intro. Use only supplied allowedNumericValues; do not number examples, invent purchase amounts, or calculate new totals. Never use these words or their variants, even in a negation or disclaimer: discount, offer, sale, coupon, code, limited, refer, net, effectively, guarantee, promise, instantly, free. Use factual wording such as a monthly cap rather than limited rewards. No URLs or new conditions. The sign pitch must contain the supplied milestone as an unchanged literal substring, including its digits. ASCII punctuation only; no newlines. Do not estimate customer behavior or delivery timing. Make the examples illustrate the same rule and constraints without adding numbers.",
          user: dataBlock({
            businessName: name,
            voiceHints,
            program: spec,
            milestone: milestoneText(spec),
            items,
            allowedNumericValues: [
              spec.rewardCents / 100,
              spec.windowDays,
              spec.minTicketCents / 100,
              spec.perCustomerMonthlyCapCents / 100,
              spec.dailyBudgetCents / 100,
              spec.monthlyBudgetCents / 100,
              spec.mergeWindowMin,
              ...(spec.type === "VISIT_MILESTONE"
                ? [spec.n, spec.endowedProgress ?? 0]
                : [spec.spendCents / 100]),
            ],
            correction,
          }),
          schema: Copy,
          effort: "low",
        });
        calls.push(response.callId);
        const invalid = [
          ...(!copyValid(response.value.termsIntro, 400, name, spec)
            ? ["termsIntro"]
            : []),
          ...response.value.workedExamples.flatMap((e, index) =>
            copyValid(e, 240, name, spec)
              ? []
              : ["workedExamples[" + index + "]"],
          ),
          ...(!copyValid(response.value.signPitch, 90, name, spec, {
            milestone: true,
          })
            ? ["signPitch"]
            : []),
        ];
        if (!invalid.length) {
          copy = response.value;
          copyFallback = false;
          break;
        }
        const rejectedWords = [
          response.value.termsIntro,
          ...response.value.workedExamples,
          response.value.signPitch,
        ].flatMap((text) => {
          const body = text.replaceAll(name, "");
          return [
            ...(body.match(denied) ?? []).slice(0, 1),
            ...(body.match(/\bfree\b/i) ?? []).slice(0, 1),
          ];
        });
        correction =
          "Local validation rejected " +
          invalid.join(", ") +
          ". Use simple ASCII text, only allowedNumericValues, and the unchanged milestone in signPitch. Keep each field within its stated character limit. Remove banned wording, including in disclaimers: " +
          [...new Set(rejectedWords)].join(", ") +
          ".";
      } catch {
        break;
      }
  return {
    notes: notes.notes,
    ...copy,
    aiCallIds: calls,
    fallback: notes.fallback || copyFallback,
  };
}
export function validateScribeSpec(
  spec: ProgramSpec,
  name: string,
  items: string[] = [],
) {
  if (
    spec.welcomeBackNote &&
    (!/loyalty reward/i.test(spec.welcomeBackNote) ||
      !spec.welcomeBackNote.includes(name) ||
      !copyValid(spec.welcomeBackNote, 120, name, spec))
  )
    throw new Error("Invalid welcome-back note");
  if (
    !spec.noteVariants?.length &&
    !copyValid(rewardNoteForValidation(spec, name), 120, name, spec, {
      notes: true,
      items,
    })
  )
    throw new Error("Thank-you notes must say loyalty reward");
  if (
    spec.noteVariants?.some(
      (n) => !copyValid(n, 120, name, spec, { notes: true, items }),
    )
  )
    throw new Error("Invalid thank-you note");
  if (spec.termsIntro && !copyValid(spec.termsIntro, 400, name, spec))
    throw new Error("Invalid terms intro");
  if (spec.workedExamples?.some((e) => !copyValid(e, 240, name, spec)))
    throw new Error("Invalid worked example");
  if (
    spec.signPitch &&
    !copyValid(spec.signPitch, 90, name, spec, { milestone: true })
  )
    throw new Error("Invalid sign pitch");
}
