// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import axe from "axe-core";
import { defaultProgram } from "@/lib/engine/program";
vi.mock("next/script", () => ({
  default: ({ onReady }: { onReady: () => void }) => (
    <button onClick={onReady}>Load payment methods</button>
  ),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { social: vi.fn() } },
}));
vi.mock("@/app/(account)/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  requestReset: vi.fn(),
  requestMagicLink: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("@/app/m/rewards/actions", () => ({ reviewReward: vi.fn() }));
vi.mock("@/app/m/cockpit/actions", () => ({
  saveCockpitState: vi.fn(),
  resetCockpitState: vi.fn(),
}));
vi.mock("next/dynamic", () => ({
  default: () => () => <p>Cockpit loading panel</p>,
}));
vi.mock("@/lib/merchants", () => ({
  loadMerchant: async () => ({
    displayName: "Rosa's Cafe",
    spec: defaultProgram,
  }),
}));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ KICKBACK_ENV: "sandbox" }) }));
import PayClient from "@/app/pay/[slug]/pay-client";
import AccountForm from "@/app/(account)/account-form";
import Terms from "@/app/pay/[slug]/terms/page";
import { ProgressBody } from "@/app/pay/[slug]/progress/progress-body";
import ReviewControls from "@/app/m/rewards/review-controls";
import CockpitClient from "@/app/m/cockpit/cockpit-client";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const roots: ReturnType<typeof createRoot>[] = [];
async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
  return host;
}
async function accessible(host: HTMLElement) {
  const result = await axe.run(host, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
    },
    rules: { "color-contrast": { enabled: false } },
  });
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.html),
    })),
  ).toEqual([]);
}
afterEach(async () => {
  await act(async () => {
    for (const r of roots.splice(0)) r.unmount();
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
const pay = (
  <PayClient
    slug="rosas"
    name="Rosa's Cafe"
    menu={[{ id: "latte", name: "Latte", priceCents: 550 }]}
    spec={defaultProgram}
    paused={false}
    clientId="public-test-id"
    sandbox
  />
);
it("has an accessible idle pay panel and custom amount", async () => {
  const host = await render(pay);
  await act(async () => {
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Other amount")!
      .click();
  });
  await accessible(host);
});
it.each(["progress", "SCHEDULED", "CONFIRMED"])(
  "keeps %s checkout feedback accessible",
  async (state) => {
    sessionStorage.setItem("kickback-order:TEST", "token");
    const sdk = {
      findEligibleMethods: async () => ({ isEligible: () => false }),
      createPayPalOneTimePaymentSession: (callbacks: {
        onApprove: (x: { orderId: string }) => Promise<void>;
      }) => ({
        hasReturned: () => true,
        resume: () => callbacks.onApprove({ orderId: "TEST" }),
      }),
      createVenmoOneTimePaymentSession: () => ({}),
    };
    Object.assign(window, { paypal: { createInstance: async () => sdk } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          captureStatus: "COMPLETED",
          recognized: true,
          progress: {
            type: "VISIT_MILESTONE",
            current: 3,
            target: 5,
            rewardCents: 200,
            windowDays: 60,
          },
          progressUrl: "https://app.test/pay/rosas/progress?t=private",
          ...(state !== "progress"
            ? {
                reward: {
                  id: "reward",
                  token: "token",
                  state,
                  amountCents: 200,
                },
              }
            : {}),
        }),
      ),
    );
    const host = await render(pay);
    await act(async () => {
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "Load payment methods")!
        .click();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(host.textContent).toContain("Save this link");
    await accessible(host);
  },
);
it("has a labeled sign-in form", async () =>
  accessible(
    await render(
      <main>
        <h1>Sign in</h1>
        <AccountForm mode="sign-in" paypal />
      </main>,
    ),
  ));
it("has accessible program terms and refund explanation", async () => {
  const node = await Terms({ params: Promise.resolve({ slug: "rosas" }) });
  const host = await render(node);
  expect(host.querySelector("#why-refund")).not.toBeNull();
  await accessible(host);
});
it("shows progress without payer contact or wallet identity", async () => {
  const host = await render(
    <ProgressBody
      slug="rosas"
      data={{
        name: "Rosa's Cafe",
        rule: "Every 5 visits earns $2 back",
        tz: "UTC",
        progress: {
          type: "VISIT_MILESTONE",
          current: 3,
          target: 5,
          rewardCents: 200,
          windowDays: 60,
        },
        lastSeen: new Date("2026-10-15"),
        paid: { count: 1, cents: 200 },
      }}
    />,
  );
  await accessible(host);
  expect(host.innerHTML).not.toMatch(/@|paypal|venmo|customerKey/i);
});
it("has distinct approve and decline controls", async () =>
  accessible(
    await render(
      <main>
        <h1>Review reward</h1>
        <ReviewControls merchantId="merchant" rewardId="reward" />
      </main>,
    ),
  ));
it("labels Cockpit tabs and toolbar controls", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  await accessible(
    await render(
      <main>
        <CockpitClient
          context={{
            name: "Cafe",
            tz: "UTC",
            rule: "5 visits",
            spec: defaultProgram,
            demo: false,
            model: "test",
          }}
          invalidState={false}
          ai={false}
        />
      </main>,
    ),
  );
});
