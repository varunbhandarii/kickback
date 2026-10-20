"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { recheckPartner, type ConnectState } from "./actions";
import { StatusChip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { connectionStatus } from "@/lib/copy";
export default function ConnectionStatus({
  status,
  mode,
  merchantId,
  name,
}: {
  status: string;
  mode: string;
  merchantId: string;
  name?: string;
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
  const chip = connectionStatus(status === "NOT_CONNECTED" ? undefined : status);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5" role="status">
        <StatusChip tone={chip.tone} label={chip.label} />
        <strong style={{ fontSize: 15 }}>
          {status === "CONNECTED"
            ? `${name ?? "Your business"} is connected`
            : status === "PENDING"
              ? "Waiting for PayPal confirmation"
              : `${name ?? "Your business"} is not connected`}
        </strong>
      </div>
      {status === "PENDING" && (
        <p className="text-2" style={{ fontSize: 14, lineHeight: 1.55 }}>
          PayPal must confirm your email and payment/refund permissions. You can safely leave this page and
          return.
        </p>
      )}
      {message && (
        <p className="text-2" style={{ fontSize: 14 }}>
          {message}
        </p>
      )}
      {mode === "PARTNER" && status !== "NOT_CONNECTED" && (
        <form action={recheck}>
          <input name="merchantId" type="hidden" value={merchantId} />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={pending} aria-busy={pending || undefined}>
            {pending ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" size={14} />}
            {pending ? "Checking…" : "Re-check connection"}
          </button>
        </form>
      )}
      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="status-line">
          {state.message}
        </p>
      )}
    </div>
  );
}
