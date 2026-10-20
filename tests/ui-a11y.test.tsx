// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import axe from "axe-core";
import { defaultProgram, loadProgram } from "@/lib/engine/program";
vi.mock("next/navigation", () => ({
  usePathname: () => "/m/rewards",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/m/actions", () => ({
  selectBusiness: vi.fn(),
  toggleRewards: vi.fn(),
  dismissIdea: vi.fn(),
  dismissNotice: vi.fn(),
  staffAction: vi.fn(),
  disconnectAction: vi.fn(),
  updateBusiness: vi.fn(),
}));
vi.mock("@/app/(account)/actions", () => ({
  signOut: vi.fn(),
  requestVerification: vi.fn(),
}));
vi.mock("@/app/m/settings/team-actions", () => ({
  sendInvite: vi.fn(),
  revokeOwner: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock("@/app/m/onboarding/program/actions", () => ({ submitProgram: vi.fn() }));
vi.mock("@/app/m/onboarding/program/ai-actions", () => ({
  proposeDesign: vi.fn(),
  writeCopy: vi.fn(),
  saveVoice: vi.fn(),
}));
vi.mock("@/app/m/onboarding/menu/actions", () => ({
  submitMenu: vi.fn(),
  downloadSign: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ KICKBACK_ENV: "sandbox", APP_URL: "https://app.test" }),
}));
import { AppShell } from "@/components/shell/app-shell";
import Home from "@/app/page";
import Privacy from "@/app/privacy/page";
import SiteTerms from "@/app/terms/page";
import AiPage from "@/app/ai/page";
import NotFound from "@/app/not-found";
import { SignSheet } from "@/app/pay/[slug]/sign/sign-sheet";
import { BusinessSettings, DisconnectForm } from "@/app/m/settings/settings-forms";
import AccountSecurity from "@/app/m/settings/account-security";
import MenuForm, { SignActions } from "@/app/m/onboarding/menu/menu-form";
import ProgramForm from "@/app/m/onboarding/program/program-form";
import { ProgressBody } from "@/app/pay/[slug]/progress/progress-body";
import { PunchRow, SpendBar, Meter, MiniProgress } from "@/components/ui";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const roots: ReturnType<typeof createRoot>[] = [];
async function render(node: ReactNode) {
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
});
const spec = loadProgram(defaultProgram);

it("labels the merchant navigation, badges and menus", async () => {
  const host = await render(
    <AppShell
      user={{ name: "Rosa", email: "rosa@example.test" }}
      businesses={[
        { id: "a", name: "Rosa's Cafe" },
        { id: "b", name: "Rosa's Bakery" },
      ]}
      current={{ id: "a", name: "Rosa's Cafe", slug: "rosas" }}
      sandbox
      reviewCount={2}
    >
      <h1>Rewards</h1>
    </AppShell>,
  );
  expect(host.querySelector('[aria-current="page"]')?.textContent).toContain("Rewards");
  const switcher = [...host.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith("Business:"))!;
  await act(async () => switcher.click());
  expect(host.textContent).toContain("Rosa's Bakery");
  await accessible(host);
});

it.each([
  ["landing", () => Home()],
  ["privacy", () => Privacy()],
  ["terms", () => SiteTerms()],
  ["AI notes", () => AiPage()],
  ["not found", () => NotFound()],
])("keeps the %s page accessible", async (_, page) => accessible(await render(page())));

it("renders the counter sign with plain wallet names", async () => {
  const sheet = await SignSheet({ name: "Rosa's Cafe", spec, url: "https://app.test/pay/rosas", sandbox: true });
  const host = await render(<main>{sheet}</main>);
  expect(host.textContent).toContain("Pay with PayPal or Venmo");
  expect(host.textContent).toContain("5 visits.");
  expect(host.querySelector("svg")).not.toBeNull();
  await accessible(host);
});

it("keeps settings forms labeled", async () =>
  accessible(
    await render(
      <main>
        <h1>Settings</h1>
        <BusinessSettings
          initial={{ id: "m", displayName: "Rosa's Cafe", slug: "rosas", tz: "UTC", category: "cafe", slugLocked: true }}
        />
        <AccountSecurity
          merchantId="m"
          email="rosa@example.test"
          verified
          emailEnabled={false}
          currentId="u1"
          owners={[
            { id: "u1", email: "rosa@example.test" },
            { id: "u2", email: "sam@example.test" },
          ]}
        />
        <DisconnectForm merchantId="m" />
      </main>,
    ),
  ));

it("explains menu eligibility per item", async () => {
  const host = await render(
    <main>
      <h1>Menu</h1>
      <MenuForm
        merchantId="m"
        minTicketCents={300}
        initial={[
          { id: "drip", name: "Drip coffee", priceCents: 365 },
          { id: "cookie", name: "Cookie", priceCents: 250 },
        ]}
      />
      <SignActions merchantId="m" slug="rosas" />
    </main>,
  );
  expect(host.textContent).toContain("Counts as a visit");
  expect(host.textContent).toContain("Under $3.00, not a visit");
  await accessible(host);
});

it("keeps the program editor labeled", async () => {
  const host = await render(
    <main>
      <h1>Program</h1>
      <ProgramForm merchantId="m" category="cafe" initial={spec} aiEnabled merchantName="Rosa's Cafe" live={spec} />
    </main>,
  );
  for (const name of ["type", "n", "reward", "minimum", "customerCap", "daily", "monthly", "window", "merge", "settlement", "noteVariants"])
    expect(host.querySelector(`[name="${name}"]`)).not.toBeNull();
  expect(host.textContent).toContain("Thanks for 5 visits: a loyalty reward from Rosa's Cafe");
  await accessible(host);
});

it("describes punch cards, bars and meters", async () => {
  const host = await render(
    <main>
      <PunchRow target={5} filled={3} rewardCents={200} />
      <PunchRow target={40} filled={12} rewardCents={500} />
      <SpendBar current={2750} target={4000} rewardCents={300} />
      <Meter value={0.04} max={0.06} guideline={0.03} limit={0.05} label="Cost 4% of revenue" />
      <MiniProgress type="VISIT_MILESTONE" current={4} target={5} rewardCents={200} />
    </main>,
  );
  const labels = [...host.querySelectorAll('[role="img"]')].map((e) => e.getAttribute("aria-label"));
  expect(labels).toContain("3 of 5 punches filled; the fifth pays $2 back");
  expect(labels).toContain("12 of 40 punches filled; the 40th pays $5 back");
  await accessible(host);
});

it("explains an expired card link without a dead end", async () => {
  const host = await render(
    <ProgressBody slug="rosas" data={{ error: "This link is invalid or has expired." }} />,
  );
  expect(host.textContent).toContain("Paying at the shop again gives you a new one.");
  await accessible(host);
});
