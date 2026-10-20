"use client";
import Link from "next/link";
import { useState } from "react";
import { resetCockpitState } from "./cockpit/actions";
import { State } from "@/components/ui";
export default function MerchantError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const [message, setMessage] = useState("");
  return (
    <section role="alert" className="card" style={{ maxWidth: 560, margin: "24px auto" }}>
      <State
        icon="alert"
        tone="danger"
        title="This page could not be loaded"
        action={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-2.5">
              <button type="button" className="btn btn-primary" onClick={reset}>
                Try again
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    await resetCockpitState();
                    reset();
                  } catch {
                    setMessage("Could not reset. Please sign in again.");
                  }
                }}
              >
                Reset Cockpit layout
              </button>
            </div>
            {message && <p className="field-error">{message}</p>}
            <Link href="/m" style={{ fontSize: 14, fontWeight: 600 }}>
              Back to overview
            </Link>
          </div>
        }
      >
        <p>Try again, or restore the Cockpit layout if this keeps happening there.</p>
      </State>
    </section>
  );
}
