"use client";
import { useActionState } from "react";
import { reviewReward } from "./actions";
export default function ReviewControls({
  merchantId,
  rewardId,
}: {
  merchantId: string;
  rewardId: string;
}) {
  const [state, action, pending] = useActionState(reviewReward, {});
  return (
    <form action={action}>
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="rewardId" value={rewardId} />
      <button name="decision" value="APPROVED" disabled={pending}>
        Approve
      </button>{" "}
      <button
        className="secondary"
        name="decision"
        value="DECLINED"
        disabled={pending}
      >
        Decline
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}
