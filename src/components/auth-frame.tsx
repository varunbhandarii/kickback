import type { ReactNode } from "react";
import { BrandLink } from "./brand";
import { PunchRow } from "./ui";
import { getEnv } from "@/lib/env";

/** Split layout for sign-in and account pages: brand panel and a form column. */
export function AuthFrame({ children }: { children: ReactNode }) {
  const sandbox = getEnv().KICKBACK_ENV === "sandbox";
  return (
    <div className="auth">
      <aside className="auth-panel on-band" aria-label="Kickback">
        <BrandLink size={24} withIcon inverse />
        <div className="auth-tagline flex flex-col gap-6">
          <p className="display" style={{ fontStretch: "125%", fontWeight: 800, fontSize: "clamp(30px, 3.4vw, 44px)", lineHeight: 1.02, letterSpacing: "-0.02em" }}>
            Your regulars, counted.
            <br />
            Thanked, automatically.
          </p>
          <div className="auth-punches flex flex-col gap-2">
            <PunchRow target={5} filled={3} rewardCents={200} size="md" label="Example card: 3 of 5 punches filled; the fifth pays $2 back" />
            <span className="band-sub" style={{ fontSize: 14 }}>
              Visit 3 of 5 at a neighborhood cafe
            </span>
          </div>
        </div>
        <p className="band-sub" style={{ fontSize: 13 }}>
          {sandbox
            ? "Kickback runs in PayPal sandbox today. Use test accounts only."
            : "Loyalty that starts with a payment."}
        </p>
      </aside>
      <main id="main" className="auth-main">
        <div className="auth-form">{children}</div>
      </main>
    </div>
  );
}
