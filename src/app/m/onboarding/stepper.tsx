"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

export const setupSteps = [
  ["business", "Business"],
  ["connect", "Connect PayPal"],
  ["history", "Read your history"],
  ["program", "Design the program"],
  ["menu", "Menu and sign"],
] as const;

/** Five-step progress. Steps up to the furthest one reached are links. */
export function Stepper({ reached }: { reached: string }) {
  const pathname = usePathname();
  const current = setupSteps.findIndex(([key]) => pathname.startsWith(`/m/onboarding/${key}`));
  const furthest = reached === "done" ? setupSteps.length : Math.max(0, setupSteps.findIndex(([key]) => key === reached));
  return (
    <nav aria-label="Setup steps">
      <ol className="stepper">
        {setupSteps.map(([key, label], i) => {
          const done = i < furthest && i !== current;
          const state = i === current ? "stepper-current" : done ? "stepper-done" : "";
          const text = (
            <>
              {done && <Icon name="check" size={14} strokeWidth={3} />}
              <span className="stepper-n">{i + 1}</span>
              <span className="stepper-name">{label}</span>
            </>
          );
          return (
            <li key={key} className={state}>
              <span className="stepper-bar" aria-hidden="true" />
              {i <= furthest || i === current ? (
                <Link href={`/m/onboarding/${key}`} aria-current={i === current ? "step" : undefined}>
                  {text}
                  {done && <span className="sr-only">, done</span>}
                </Link>
              ) : (
                <span className="stepper-text">{text}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
