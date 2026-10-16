"use client";
import { useActionState, useState } from "react";
import { preset } from "@/lib/merchant-inputs";
import type { ProgramSpec } from "@/lib/engine/program";
import { submitProgram } from "./actions";
import DesignerPanel from "./designer-panel";
import ScribePanel from "./scribe-panel";
import type { DesignResult } from "@/lib/ai/designer/pipeline";
export default function ProgramForm({
  category,
  initial,
  merchantId,
  aiEnabled = false,
  margin = 60,
  initialDesign,
}: {
  category: string;
  merchantId: string;
  initial?: ProgramSpec;
  aiEnabled?: boolean;
  margin?: number;
  initialDesign?: DesignResult & { id: string };
}) {
  const [choice, setChoice] = useState(category),
    [spec, setSpec] = useState(initial ?? preset(category)),
    [state, action, pending] = useActionState(submitProgram, {});
  const [winBackEstimate, setWinBackEstimate] = useState("");
  const [designRef, setDesignRef] = useState({
      runId: "",
      candidateId: "",
      liftAssumptionPct: 5,
    }),
    [scribeRef, setScribeRef] = useState("");
  const change = (field: string, value: string, isMoney = false) =>
    setSpec({
      ...spec,
      [field]: isMoney ? Math.round(Number(value) * 100) : Number(value),
    } as ProgramSpec);
  return (
    <>
      <DesignerPanel
        merchantId={merchantId}
        enabled={aiEnabled}
        margin={margin}
        initial={initialDesign}
        onUse={(chosen, runId, candidateId, liftAssumptionPct) => {
          setSpec(chosen);
          setDesignRef({ runId, candidateId, liftAssumptionPct });
          setScribeRef("");
        }}
      />
      <ScribePanel
        merchantId={merchantId}
        spec={spec}
        onUse={(chosen, id) => {
          setSpec(chosen);
          setScribeRef(id);
        }}
      />
      <form action={action} className="merchant-card">
        <input name="merchantId" type="hidden" value={merchantId} />
        <fieldset>
          <legend>Welcome-back reward (optional)</legend>
          <label>
            <input
              type="checkbox"
              name="winBack"
              checked={!!spec.winBack}
              onChange={(e) => {
                setSpec({
                  ...spec,
                  winBack: e.target.checked
                    ? {
                        gapDays: 30,
                        rewardCents: Math.min(200, spec.rewardCents),
                        minVisits: 3,
                      }
                    : undefined,
                } as ProgramSpec);
                setWinBackEstimate("");
              }}
            />{" "}
            Thank returning regulars after a long gap
          </label>
          {spec.winBack && (
            <>
              <label>
                Gap in days
                <select
                  name="winBackGap"
                  value={spec.winBack.gapDays}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      winBack: {
                        ...spec.winBack!,
                        gapDays: Number(e.target.value) as 30 | 45 | 60 | 90,
                      },
                    })
                  }
                >
                  {[30, 45, 60, 90].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Reward in USD
                <input
                  name="winBackReward"
                  type="number"
                  min="1"
                  max={Math.min(10, spec.rewardCents / 100)}
                  step="0.01"
                  value={spec.winBack.rewardCents / 100}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      winBack: {
                        ...spec.winBack!,
                        rewardCents: Math.round(Number(e.target.value) * 100),
                      },
                    })
                  }
                />
              </label>
              <label>
                Previous qualifying visits
                <input
                  name="winBackMin"
                  type="number"
                  min="3"
                  max="100"
                  value={spec.winBack.minVisits}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      winBack: {
                        ...spec.winBack!,
                        minVisits: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <p>
                At most once per 180 days. A regular milestone takes precedence.
                Existing caps and budgets apply; imported history never triggers
                a retroactive payment.
              </p>
              <button
                type="button"
                onClick={async () => {
                  setWinBackEstimate("Backtesting…");
                  try {
                    const r = await fetch("/api/analyst/simulate_rules", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ spec }),
                    });
                    if (!r.ok) throw new Error();
                    const m = await r.json();
                    setWinBackEstimate(
                      `${m.winBackRewards} welcome-back rewards / $${(m.winBackCostCents / 100).toFixed(2)} over 90 days.${m.demoShare > 0 ? " Includes demo history." : ""}`,
                    );
                  } catch {
                    setWinBackEstimate(
                      "Estimate unavailable. Check the rule and limits.",
                    );
                  }
                }}
              >
                Estimate welcome-back cost
              </button>
              <p role="status">{winBackEstimate}</p>
            </>
          )}
        </fieldset>
        <input name="designRunId" type="hidden" value={designRef.runId} />
        <input name="candidateId" type="hidden" value={designRef.candidateId} />
        <input
          name="approvedLift"
          type="hidden"
          value={designRef.liftAssumptionPct}
        />
        <input name="scribeRunId" type="hidden" value={scribeRef} />
        <input name="termsIntro" type="hidden" value={spec.termsIntro ?? ""} />
        <input
          name="workedExamples"
          type="hidden"
          value={JSON.stringify(spec.workedExamples ?? [])}
        />
        <input name="signPitch" type="hidden" value={spec.signPitch ?? ""} />
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
                setDesignRef({
                  runId: "",
                  candidateId: "",
                  liftAssumptionPct: 5,
                });
                setScribeRef("");
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
        {spec.type === "VISIT_MILESTONE" && (
          <label>
            Starting progress (first cycle only)
            <input
              name="endowedProgress"
              type="number"
              min={0}
              max={Math.min(18, spec.n - 2)}
              value={spec.endowedProgress ?? 0}
              onChange={(e) => change("endowedProgress", e.target.value)}
            />
            <span className="muted">
              At least two actual qualifying visits are always required.
            </span>
          </label>
        )}
        <label>
          Thank-you notes (one per line; include “loyalty reward”, the business
          name and milestone; leave blank for the template)
          <textarea
            name="noteVariants"
            maxLength={1000}
            value={(spec.noteVariants ?? []).join("\n")}
            onChange={(e) =>
              setSpec({
                ...spec,
                noteVariants: e.target.value ? e.target.value.split("\n") : [],
              })
            }
          />
        </label>
        {spec.termsIntro && <p>Terms introduction: {spec.termsIntro}</p>}
        {spec.signPitch && <p>Sign pitch: {spec.signPitch}</p>}
        {!!spec.noteVariants?.length && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setSpec({
                ...spec,
                noteVariants: [],
                termsIntro: undefined,
                workedExamples: undefined,
                signPitch: undefined,
              });
              setScribeRef("");
            }}
          >
            Use template copy
          </button>
        )}
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
    </>
  );
}
