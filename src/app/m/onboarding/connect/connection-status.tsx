"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { recheckPartner, type ConnectState } from "./actions";
export default function ConnectionStatus({
  status,
  mode,
  merchantId,
}: {
  status: string;
  mode: string;
  merchantId: string;
}) {
  const router = useRouter(),
    [state, recheck, pending] = useActionState<ConnectState, FormData>(
      recheckPartner,
      {},
    ),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (state.message === "PayPal confirmed your connection.") router.refresh();
  }, [state.message, router]);
  useEffect(() => {
    if (status !== "PENDING" || mode !== "PARTNER") return;
    const started = Date.now();
    let stopped = false;
    const timer = setInterval(() => {
      if (Date.now() - started > 120000) {
        clearInterval(timer);
        setMessage(
          "Still waiting. Confirm your email on PayPal, then re-check here.",
        );
        return;
      }
      void fetch(`/api/m/connection/status?merchantId=${merchantId}`, {
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) return;
          const result = await response.json();
          if (!stopped && result.status === "CONNECTED") {
            clearInterval(timer);
            router.refresh();
          }
        })
        .catch(() => {});
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [status, mode, router, merchantId]);
  return (
    <div className="merchant-card">
      <p role="status">
        <strong>
          {status === "CONNECTED"
            ? "Your business is connected"
            : status === "PENDING"
              ? "Waiting for PayPal confirmation"
              : "Your business is not connected"}
        </strong>
      </p>
      {status === "PENDING" && (
        <p>
          PayPal must confirm your email and payment/refund permissions. You can
          safely leave this page and return.
        </p>
      )}
      {message && <p>{message}</p>}
      {mode === "PARTNER" && (
        <form action={recheck}>
          <input name="merchantId" type="hidden" value={merchantId} />
          <button className="merchant-secondary" disabled={pending}>
            {pending ? "Checking…" : "Re-check connection"}
          </button>
        </form>
      )}
      {state.error && (
        <p role="alert" className="merchant-error">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
    </div>
  );
}
