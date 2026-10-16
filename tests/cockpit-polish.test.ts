import { it, expect } from "vitest";
import { defaultState } from "@/lib/studio/default-state";
import { restoreLayout, withDateWindow } from "@/lib/studio/layout";
import { validateState } from "@/lib/studio/state";
import { defaultProgram } from "@/lib/engine/program";
import { mdeSentence } from "@/lib/studio/measurement";
import { telemetrySchema } from "@/lib/studio/telemetry-server";
import { isIsoDate } from "@/lib/studio/query";
const c = {
  name: "Cafe",
  tz: "UTC",
  rule: "5 visits",
  spec: defaultProgram,
  demo: false,
  model: "test",
  asOfDay: "2026-10-15",
};
it("includes a Risk page with pivot, ledger and usage", () => {
  const risk = defaultState(c).pages.find((p) => p.id === "risk")!;
  expect(risk.widgets?.visits_pivot?.type).toBe("pivot-grid");
  expect(risk.widgets?.ledger2?.type).toBe("customer-ledger");
  expect(risk.widgets?.ai_runs).toBeDefined();
});
it("upgrades old layouts while preserving merchant widgets", () => {
  const state = defaultState(c);
  state.pages = state.pages.slice(0, 1);
  state.pages[0].widgets!.mine = {
    type: "text",
    dataMapping: {},
    format: { style: { text: "Saved" } },
  };
  const next = restoreLayout(state, c);
  expect(next.pages.map((p) => p.id)).toEqual(["loyalty", "risk"]);
  expect(next.pages[0].widgets?.mine).toBeDefined();
});
it.each([false, [], "oops", { widget: false }])(
  "rejects corrupt page filter %s",
  (filter) => {
    const s = defaultState(c);
    Object.assign(s.pages[0], { filter });
    expect(() => restoreLayout(s, c)).toThrow();
  },
);
it("rejects duplicate pages", () => {
  const s = defaultState(c);
  s.pages[1].id = "loyalty";
  expect(() => validateState(s)).toThrow();
});
it("preserves a chosen date window on reload", () => {
  const next = restoreLayout(
    withDateWindow(defaultState(c), 7, "2026-10-14"),
    c,
  );
  expect(next.kpiDays).toBe(7);
  expect(next.pages[0].filter?.widget?.trend?.[0].model).toEqual({
    operator: "between",
    value: ["2026-10-09", "2026-10-15"],
  });
});
it.each([0, 366, 2.5])("rejects date window %s", (n) =>
  expect(() => withDateWindow(defaultState(c), n, c.asOfDay)).toThrow(),
);
it("matches the published 100-regular MDE arithmetic", () =>
  expect(mdeSentence(100)).toContain("58% (assumed visit variability)"));
it("does not invent precision for tiny cohorts", () =>
  expect(mdeSentence(3)).toContain("too few regulars"));
it.each(["2026-02-30", "10/15/2026", "yesterday", "2026-10-15T25:00:00Z"])(
  "rejects invalid ISO input %s",
  (v) => expect(isIsoDate(v)).toBe(false),
);
it.each(["2026-10-15", "2026-10-15T23:00:00Z", "2026-10-15T23:00:00-04:00"])(
  "accepts strict ISO %s",
  (v) => expect(isIsoDate(v)).toBe(true),
);
const metric = () => ({
  threadId: "t",
  runId: "r",
  agentId: "analyst",
  startedAt: Date.now() - 1000,
  finishedAt: Date.now(),
  status: "ok",
  turns: 1,
  toolCalls: 2,
  toolErrors: 0,
});
it("accepts count-only telemetry", () =>
  expect(telemetrySchema.safeParse([metric()]).success).toBe(true));
it.each(["prompt", "args", "text", "result", "instructions"])(
  "rejects free-text telemetry %s",
  (field) =>
    expect(
      telemetrySchema.safeParse([{ ...metric(), [field]: "private" }]).success,
    ).toBe(false),
);
it("rejects excessive batches and impossible dates", () => {
  expect(
    telemetrySchema.safeParse(Array.from({ length: 51 }, metric)).success,
  ).toBe(false);
  expect(
    telemetrySchema.safeParse([{ ...metric(), startedAt: Date.now() + 5000 }])
      .success,
  ).toBe(false);
});
