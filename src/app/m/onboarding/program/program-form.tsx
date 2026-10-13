"use client";
import { useActionState, useState } from "react";
import { preset } from "@/lib/merchant-inputs";
import type { ProgramSpec } from "@/lib/engine/program";
import { submitProgram } from "./actions";
export default function ProgramForm({
  category,
  initial,
  merchantId,
}: {
  category: string;
  merchantId: string;
  initial?: ProgramSpec;
}) {
  const [choice, setChoice] = useState(category),
    [spec, setSpec] = useState(initial ?? preset(category)),
    [state, action, pending] = useActionState(submitProgram, {});
  const change = (field: string, value: string, isMoney = false) =>
    setSpec({
      ...spec,
      [field]: isMoney ? Math.round(Number(value) * 100) : Number(value),
    } as ProgramSpec);
  return (
    <form action={action} className="merchant-card">
      <input name="merchantId" type="hidden" value={merchantId} />
      <h2>Choose a reward program</h2>
      <p>
        Existing visits carry forward. Refunds start with milestones reached
        after activation.
      </p>
      <div className="preset-grid">
        {["cafe", "salon", "bakery"].map((item) => (
          <button
            type="button"
            className={choice === item ? "" : "secondary"}
            key={item}
            onClick={() => {
              setChoice(item);
              setSpec(preset(item));
            }}
          >
            {item === "cafe"
              ? "Cafe · 5 visits / $2"
              : item === "salon"
                ? "Salon · 4 visits / $5"
                : "Bakery · $40 spent / $3"}
          </button>
        ))}
      </div>
      <input type="hidden" name="preset" value={choice} />
      <label>
        Earn by
        <select
          name="type"
          value={spec.type}
          onChange={(e) =>
            setSpec(
              e.target.value === "VISIT_MILESTONE"
                ? { ...spec, type: "VISIT_MILESTONE", n: 5 }
                : { ...spec, type: "SPEND_MILESTONE", spendCents: 4000 },
            )
          }
        >
          <option value="VISIT_MILESTONE">Visits</option>
          <option value="SPEND_MILESTONE">Amount spent</option>
        </select>
      </label>
      {spec.type === "VISIT_MILESTONE" ? (
        <label>
          Visits per reward
          <input
            name="n"
            type="number"
            min={2}
            max={100}
            value={spec.n}
            onChange={(e) => change("n", e.target.value)}
            required
          />
        </label>
      ) : (
        <label>
          Spend per reward (USD)
          <input
            name="spend"
            type="number"
            step=".01"
            min=".01"
            value={spec.spendCents / 100}
            onChange={(e) => change("spendCents", e.target.value, true)}
            required
          />
        </label>
      )}
      <div className="merchant-grid">
        {[
          ["reward", "Reward (USD)", "rewardCents"],
          ["minimum", "Minimum qualifying purchase (USD)", "minTicketCents"],
          [
            "customerCap",
            "Monthly limit per customer (USD)",
            "perCustomerMonthlyCapCents",
          ],
          ["daily", "Daily reward budget (USD)", "dailyBudgetCents"],
          ["monthly", "Monthly reward budget (USD)", "monthlyBudgetCents"],
        ].map(([name, label, key]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              type="number"
              step=".01"
              min="0"
              max={name === "reward" ? "25" : undefined}
              value={(spec[key as keyof ProgramSpec] as number) / 100}
              onChange={(e) => change(key, e.target.value, true)}
              required
            />
          </label>
        ))}
        <label>
          Window (days)
          <input
            name="window"
            type="number"
            min={1}
            max={365}
            value={spec.windowDays}
            onChange={(e) => change("windowDays", e.target.value)}
            required
          />
        </label>
        <label>
          Combine nearby payments (minutes)
          <input
            name="merge"
            type="number"
            min={30}
            max={240}
            value={spec.mergeWindowMin}
            onChange={(e) => change("mergeWindowMin", e.target.value)}
            required
          />
        </label>
        <label>
          Send rewards
          <select
            name="settlement"
            value={spec.settlement}
            onChange={(e) =>
              setSpec({
                ...spec,
                settlement: e.target.value as ProgramSpec["settlement"],
              })
            }
          >
            <option value="INSTANT">Immediately</option>
            <option value="DELAYED">After 24 hours</option>
            <option value="REVIEW">Hold for review</option>
          </select>
        </label>
      </div>
      {state.error && <p role="alert">{state.error}</p>}
      <button disabled={pending}>
        {pending ? "Activating…" : "Activate program"}
      </button>
    </form>
  );
}
