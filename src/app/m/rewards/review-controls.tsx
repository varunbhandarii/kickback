"use client";
import { useActionState } from "react";
import { reviewReward } from "./actions";
import { toast } from "@/components/toast";
import { money } from "@/lib/format";
export default function ReviewControls({
  merchantId,
  rewardId,
  amountCents,
}: {
  merchantId: string;
  rewardId: string;
  amountCents?: number;
}) {
  const [state, action, pending] = useActionState(
    async (prev: { error?: string; message?: string }, form: FormData) => {
      const result = await reviewReward(prev, form);
      // The card leaves the queue once the page refreshes, so confirm outside it.
      if (result?.message)
        toast(
          form.get("decision") === "APPROVED"
            ? `Reward approved.${amountCents ? ` ${money(amountCents)} is on its way.` : ""}`
            : "Reward declined.",
        );
      return result ?? {};
    },
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="rewardId" value={rewardId} />
      <div className="flex flex-wrap gap-2.5">
        <button
          type="submit"
          className="btn btn-primary"
          name="decision"
          value="APPROVED"
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending && <span className="spinner" aria-hidden="true" />}
          {amountCents ? `Approve and send ${money(amountCents)}` : "Approve"}
        </button>
        <button
          type="submit"
          className="btn btn-secondary"
          name="decision"
          value="DECLINED"
          disabled={pending}
        >
          Decline
        </button>
      </div>
      <p className="caption" style={{ fontSize: 13 }}>
        Approving sends the refund after the usual eligibility checks. Declining cancels this reward; the
        customer&apos;s card still starts over.
      </p>
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
    </form>
  );
}
