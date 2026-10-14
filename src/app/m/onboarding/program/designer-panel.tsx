"use client";
import { useState, useTransition } from "react";
import type { ProgramSpec } from "@/lib/engine/program";
import { candidateSpec } from "@/lib/ai/designer";
import type { DesignResult } from "@/lib/ai/designer/pipeline";
import { proposeDesign } from "./ai-actions";
const money = (cents: number) => "$" + (cents / 100).toFixed(2),
  percent = (ratio: number) => (ratio * 100).toFixed(1) + "%";
export default function DesignerPanel({
  merchantId,
  enabled,
  margin,
  onUse,
  initial,
}: {
  merchantId: string;
  enabled: boolean;
  margin: number;
  onUse: (
    spec: ProgramSpec,
    runId: string,
    candidateId: string,
    lift: number,
  ) => void;
  initial?: DesignResult & { id: string };
}) {
  const [result, setResult] = useState(initial),
    [error, setError] = useState(""),
    [lift, setLift] = useState(initial?.input.liftAssumptionPct ?? 5),
    [pending, start] = useTransition();
  const propose = (form: FormData) =>
    start(async () => {
      setError("");
      const response = await proposeDesign(form);
      if (response.result) setResult(response.result);
      else setError(response.error ?? "Design unavailable.");
    });
  return (
    <section className="merchant-card designer-panel">
      <h2>Program Designer</h2>
      <p>
        Turn your goal and history into three proposals. You choose the rule;
        the backtest supplies the arithmetic.
      </p>
      <form action={propose}>
        <input type="hidden" name="merchantId" value={merchantId} />
        <label>
          Goal
          <textarea
            name="goal"
            maxLength={300}
            required
            defaultValue={
              initial?.input.goal ??
              "Appreciate my returning customers without exceeding my budget."
            }
          />
        </label>
        <div className="merchant-grid">
          <label>
            Monthly budget (USD)
            <input
              name="budget"
              type="number"
              min="1"
              max="100000"
              step=".01"
              required
              defaultValue={(initial?.input.budgetCents ?? 15000) / 100}
            />
          </label>
          <label>
            Gross margin (%)
            <input
              name="margin"
              type="number"
              min="1"
              max="100"
              step=".1"
              defaultValue={initial?.input.marginPct ?? margin}
              required
            />
          </label>
        </div>
        <label>
          Assumed sales lift: {lift}%
          <input
            name="lift"
            type="range"
            min={3}
            max={10}
            step={1}
            value={lift}
            onChange={(e) => setLift(Number(e.target.value))}
          />
        </label>
        <p className="muted">
          Assumption only; field evidence spans 2–6%. This is not measured
          growth.
        </p>
        <button disabled={pending || !enabled}>
          {pending
            ? "Reading history, proposing, simulating and explaining…"
            : "Propose three programs"}
        </button>
        {!enabled && (
          <p>
            AI is unavailable. Manual presets and template copy remain
            available.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </form>
      <p>
        <a href="/ai" target="_blank" rel="noreferrer">
          Why these numbers?
        </a>
      </p>
      {result && (
        <>
          <p>
            {result.fallbackReason ??
              (result.fallback
                ? "Some AI output failed validation; template explanations are shown."
                : "Parameters and explanations passed local validation.")}
          </p>
          {result.includesDemoHistory && (
            <p className="merchant-banner">
              Includes demo history: {percent(result.demoShare)} of simulated
              visits. Synthetic history never earns a refund.
            </p>
          )}
          <div className="designer-cards">
            {result.cards.map((card) => {
              const { params: p, metrics: m } = card;
              return (
                <article className="merchant-card" key={p.id}>
                  <h3>
                    {p.id} · {p.name}
                  </h3>
                  <p>
                    {p.type === "VISIT_MILESTONE"
                      ? p.n + " visits"
                      : money(p.spend_cents!) + " spent"}{" "}
                    within {p.window_days} days → {money(p.reward_cents)} back;{" "}
                    {money(p.min_ticket_cents)} minimum.
                  </p>
                  <dl className="metric-grid">
                    {[
                      ["Monthly cost", money(m.monthlyCostCents)],
                      ["Earners / customers", m.earners + " / " + m.customers],
                      ["Share reaching", percent(m.shareReaching)],
                      [
                        "Median first reward",
                        m.medianDaysToFirstReward === null
                          ? "No earner"
                          : m.medianDaysToFirstReward.toFixed(1) + " days",
                      ],
                      ["Refund count ratio", percent(m.refundCountRatio)],
                      ["Reward / revenue", percent(m.gmvRatio)],
                      ["Heavy-buyer share", percent(m.top10RewardShare)],
                      ["Blocked milestones", m.budgetBlocked],
                      ["Break-even lift", m.requiredLiftPct.toFixed(1) + "%"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p
                    className={
                      m.gmvRatio <= 0.03 ? "metric-green" : "metric-amber"
                    }
                  >
                    {m.gmvRatio <= 0.03
                      ? "Within the 3% revenue guideline."
                      : "Above the 3% revenue guideline."}
                  </p>
                  <p>
                    Needs about {m.requiredLiftPct.toFixed(1)}% more sales to
                    break even at your margin. At the {lift}% assumption it{" "}
                    {lift >= m.requiredLiftPct ? "would" : "would not"} break
                    even.
                  </p>
                  <p>{card.explanation.pitch}</p>
                  <p>{card.explanation.rationale}</p>
                  <p className="muted">{card.explanation.tradeoff}</p>
                  {!!card.warnings.length && (
                    <ul>
                      {card.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    disabled={!card.acceptable}
                    onClick={() =>
                      onUse(candidateSpec(p), result.id, p.id, lift)
                    }
                  >
                    Use this
                  </button>{" "}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      document
                        .querySelector(".designer-cards")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Compare
                  </button>
                  {!card.acceptable && (
                    <p>Rejected by the simulation ceiling.</p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
