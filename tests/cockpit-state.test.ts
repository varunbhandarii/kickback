import { describe, it, expect } from "vitest";
import { validateState } from "@/lib/studio/state";
import { defaultState } from "@/lib/studio/default-state";
import { defaultProgram } from "@/lib/engine/program";
const context = {
  name: "Cafe",
  tz: "UTC",
  spec: defaultProgram,
  rule: "5 visits",
  demo: true,
  model: "test",
};
describe("Cockpit layouts", () => {
  it("builds deterministic tenant-free defaults", () => {
    expect(defaultState(context)).toEqual(defaultState(context));
    expect(validateState(defaultState(context)).selectedPageId).toBe("loyalty");
  });
  it.each([
    {},
    { pages: [], selectedPageId: "loyalty" },
    { pages: [{ id: "foreign" }], selectedPageId: "foreign" },
  ])("rejects corrupt or foreign pages", (state) =>
    expect(() => validateState(state)).toThrow(),
  );
  it("rejects excessive serialized size", () =>
    expect(() =>
      validateState({ ...defaultState(context), junk: "x".repeat(262144) }),
    ).toThrow());
});
