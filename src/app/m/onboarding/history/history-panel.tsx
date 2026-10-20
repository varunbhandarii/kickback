"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { continueHistory, importHistory } from "./actions";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/form-controls";
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
  const facts: [string, number][] = [
    ["Payments", Number(stats.payments ?? 0)],
    ["Recognized customers", Number(stats.customers ?? 0)],
    ["Regulars with 4+ visits in 60 days", Number(stats.regulars4 ?? 0)],
    ["Payments without a linked wallet", Number(stats.unrecognizedPayments ?? 0)],
  ];
  return (
    <div className="flex flex-col gap-5">
      <section className="card card-pad flex flex-col gap-4" aria-labelledby="history-title">
        <div>
          <h2 id="history-title" className="card-title">
            Your existing regulars
          </h2>
          <p className="text-2" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 4 }}>
            Read up to 90 days of PayPal and Venmo sales. Completed milestones in history will not issue refunds.
          </p>
        </div>
        {!searchEnabled && (
          <p className="banner banner-info">
            Skipped: enable Transaction Search on your PayPal app to import history. You can continue and import it
            later.
          </p>
        )}
        {running && (
          <div className="flex flex-col gap-2">
            <div className="meter" role="progressbar" aria-label="History import" aria-valuemin={0} aria-valuemax={3} aria-valuenow={run?.windowsDone ?? 0}>
              <span className="meter-fill" style={{ width: `${((run?.windowsDone ?? 0) / 3) * 100}%` }} />
            </div>
            <p role="status" className="status-line">
              <span className="spinner" aria-hidden="true" />
              Reading 90 days of sales… {run?.rowsSeen ?? 0} payments checked so far. This continues safely in the
              background.
            </p>
          </div>
        )}
        {run?.status === "DONE" && (
          <div role="status" className="flex flex-col gap-3">
            <p className="flex items-center gap-2" style={{ fontWeight: 600 }}>
              <Icon name="check" size={18} strokeWidth={2.5} style={{ color: "var(--forest)" }} />
              Your last 90 days are in
            </p>
            <dl className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              {facts.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5" style={{ padding: "12px 14px", borderRadius: 12, background: "var(--surface-2)" }}>
                  <dt className="caption">{label}</dt>
                  <dd className="display num" style={{ fontSize: 26 }}>
                    {value.toLocaleString("en-US")}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {run?.error && (
          <p role="alert" className="alert">
            {run.error === "HISTORY_VOLUME_LIMIT"
              ? "This account has more than 10,000 transactions in a reporting window. Contact support to arrange a larger import."
              : "The import stopped safely. Check your PayPal connection and retry."}
          </p>
        )}
        <form action={action} className="flex flex-col gap-2">
          <input name="merchantId" type="hidden" value={merchantId} />
          <button
            type="submit"
            className={`btn ${run?.status === "DONE" ? "btn-secondary" : "btn-primary"} self-start`}
            disabled={!searchEnabled || pending || running}
            aria-busy={pending || undefined}
          >
            {pending && <span className="spinner" aria-hidden="true" />}
            {pending ? "Starting…" : run ? "Read history again" : "Read my sales history"}
          </button>
          {state.error && (
            <p role="alert" className="alert">
              {state.error}
            </p>
          )}
        </form>
        <p className="caption" style={{ fontSize: 13 }}>
          PayPal reporting may take up to three hours to include a new payment. Guest payments are counted without
          creating customer profiles.
        </p>
      </section>
      <form action={continueHistory}>
        <input name="merchantId" type="hidden" value={merchantId} />
        <SubmitButton className={`btn ${run?.status === "DONE" || !searchEnabled ? "btn-primary" : "btn-secondary"} btn-lg`} disabled={running}>
          Design your program
          <Icon name="arrowRight" size={16} />
        </SubmitButton>
      </form>
    </div>
  );
}
