"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { continueHistory, importHistory } from "./actions";
type Run = {
  id: string;
  status: string;
  rowsSeen: number;
  windowsDone: number;
  error: string | null;
};
export default function HistoryPanel({
  initial,
  searchEnabled,
  stats,
  merchantId,
}: {
  merchantId: string;
  initial?: Run;
  searchEnabled: boolean;
  stats: Record<string, unknown>;
}) {
  const [run, setRun] = useState(initial),
    [state, action, pending] = useActionState(importHistory, {}),
    router = useRouter();
  useEffect(() => {
    if (
      ["DONE", "FAILED"].includes(run?.status ?? "") &&
      (!state.runId || run?.id === state.runId)
    )
      return;
    if (!state.runId && !["QUEUED", "RUNNING"].includes(run?.status ?? ""))
      return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/m/backfill/status?merchantId=${merchantId}`,
          {
            cache: "no-store",
          },
        );
        if (!response.ok) return;
        const data = await response.json();
        if (alive) {
          setRun(data.run);
          if (data.run?.status === "DONE" || data.run?.status === "FAILED")
            router.refresh();
        }
      } catch {}
    }, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [state.runId, run?.status, run?.id, router, merchantId]);
  const running = ["QUEUED", "RUNNING"].includes(run?.status ?? "");
  return (
    <section className="merchant-card">
      <h2>Your existing regulars</h2>
      <p>
        Read up to 90 days of PayPal and Venmo sales. Completed milestones in
        history will not issue refunds.
      </p>
      {!searchEnabled && (
        <p>
          Skipped — enable Transaction Search to import history. You can
          continue and import it later.
        </p>
      )}
      {running && (
        <>
          <progress max={3} value={run?.windowsDone ?? 0} />
          <p role="status">
            Reading history: {run?.rowsSeen ?? 0} rows checked. This continues
            safely in the background.
          </p>
        </>
      )}
      {run?.status === "DONE" && (
        <p role="status">
          In the last 90 days: {Number(stats.payments ?? 0)} payments from{" "}
          {Number(stats.customers ?? 0)} recognized customers ·{" "}
          {Number(stats.regulars4 ?? 0)} came 4+ times in 60 days ·{" "}
          {Number(stats.unrecognizedPayments ?? 0)} payments could not be linked
          to an account.
        </p>
      )}
      {run?.error && (
        <p role="alert">
          {run.error === "HISTORY_VOLUME_LIMIT"
            ? "This account has more than 10,000 transactions in a reporting window. Contact support to arrange a larger import."
            : "The import stopped safely. Check your PayPal connection and retry."}
        </p>
      )}
      <form action={action}>
        <input name="merchantId" type="hidden" value={merchantId} />
        <button disabled={!searchEnabled || pending || running}>
          {pending
            ? "Starting…"
            : run
              ? "Read history again"
              : "Read my sales history"}
        </button>
        {state.error && <p role="alert">{state.error}</p>}
      </form>
      <form action={continueHistory}>
        <input name="merchantId" type="hidden" value={merchantId} />
        <button className="secondary" disabled={running}>
          Continue to program
        </button>
      </form>
      <p className="muted">
        PayPal reporting may take up to three hours to include a new payment.
        Guest payments are counted without creating customer profiles.
      </p>
    </section>
  );
}
