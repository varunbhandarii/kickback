"use client";
import Link from "next/link";
import { useState } from "react";
import { resetCockpitState } from "./cockpit/actions";
export default function MerchantError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const [message, setMessage] = useState("");
  return (
    <section role="alert">
      <h1>This page could not be loaded</h1>
      <p>Try again or restore the Cockpit layout.</p>
      <button onClick={reset}>Try again</button>
      <button
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
      <p>{message}</p>
      <Link href="/m">Overview</Link>
    </section>
  );
}
