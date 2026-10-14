import { describe, it, expect, vi } from "vitest";
import type { StructuredCaller } from "@/lib/ai/client";
vi.mock("@/lib/ai/client", async (original) => ({
  ...(await original<typeof import("@/lib/ai/client")>()),
  aiEnabled: () => true,
}));
import {
  copyValid,
  templateNotes,
  templateCopy,
  validateScribeSpec,
  generateScribe,
} from "@/lib/ai/scribe";
import { defaultProgram, rewardNote } from "@/lib/engine/program";
const spec = { ...defaultProgram },
  name = "Rosa's Cafe";
describe("customer-facing copy validators", () => {
  it("regenerates rejected public fields with feedback and exact numeric constraints", async () => {
    const requests: { feature: string; user: string }[] = [];
    let attempt = 0;
    const caller: StructuredCaller = async (opts) => {
      requests.push({ feature: opts.feature, user: opts.user });
      const value =
        opts.feature === "scribe.notes"
          ? { notes: templateNotes(name, spec) }
          : ++attempt === 1
            ? {
                ...templateCopy(name, spec),
                termsIntro: "Rewards are limited.",
                signPitch: "Come back five times.",
              }
            : templateCopy(name, spec);
      return {
        value: opts.schema.parse(value),
        callId: "call-" + requests.length,
        model: "test",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      };
    };
    const result = await generateScribe(
      "merchant",
      name,
      "Friendly",
      spec,
      ["Latte"],
      caller,
    );
    expect(result.fallback).toBe(false);
    expect(result.aiCallIds).toHaveLength(3);
    expect(requests[2].user).toContain(
      "Local validation rejected termsIntro, signPitch",
    );
    expect(requests[2].user).toContain("disclaimers: limited");
    expect(requests[2].user).toContain("allowedNumericValues");
    expect(result.signPitch).toContain("5 visits");
  });
  it("validates six deterministic notes and public copy", () => {
    const notes = templateNotes(name, spec),
      copy = templateCopy(name, spec);
    expect(notes).toHaveLength(6);
    expect(new Set(notes).size).toBe(6);
    expect(() =>
      validateScribeSpec({ ...spec, noteVariants: notes, ...copy }, name),
    ).not.toThrow();
  });
  it.each([
    "Visit https://bad.test",
    "5 visits\nnew",
    "5 visits discount",
    "5 visits coupon",
    "5 visits limited offer",
    "5 visits effectively $1",
    "5 visits $99",
    "5 visits free cake",
    "5 visits 😀😀",
  ])("rejects invalid note %s", (body) =>
    expect(copyValid(name + " " + body, 120, name, spec, { notes: true })).toBe(
      false,
    ),
  );
  it("requires exact business and milestone, permits one emoji and exact free item", () => {
    expect(
      copyValid("Thanks for 5 visits", 120, name, spec, { notes: true }),
    ).toBe(false);
    expect(
      copyValid(name + " thanks for 4 visits", 120, name, spec, {
        notes: true,
      }),
    ).toBe(false);
    expect(
      copyValid(name + " thanks for 5 visits 😀", 120, name, spec, {
        notes: true,
      }),
    ).toBe(true);
    expect(
      copyValid(name + " 5 visits free Latte", 120, name, spec, {
        notes: true,
        items: ["Latte"],
      }),
    ).toBe(true);
  });
  it("validates a required spend threshold and keeps variant selection stable across retry", () => {
    const spend = {
        ...spec,
        type: "SPEND_MILESTONE" as const,
        spendCents: 4000,
      },
      notes = templateNotes(name, spend);
    expect(notes).toHaveLength(6);
    expect(
      rewardNote({ ...spend, noteVariants: notes }, name, "reward-one"),
    ).toBe(rewardNote({ ...spend, noteVariants: notes }, name, "reward-one"));
    expect(notes).toContain(
      rewardNote({ ...spend, noteVariants: notes }, name, "reward-one"),
    );
  });
});
