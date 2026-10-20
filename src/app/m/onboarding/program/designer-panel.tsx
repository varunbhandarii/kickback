"use client";
import { useState, useTransition } from "react";
import type { ProgramSpec } from "@/lib/engine/program";
import { candidateSpec } from "@/lib/ai/designer";
import type { DesignResult } from "@/lib/ai/designer/pipeline";
import { proposeDesign } from "./ai-actions";
import { Chip, Meter, PunchRow, SpendBar } from "@/components/ui";
import { Icon } from "@/components/icons";
import { programHeadline } from "@/lib/format";
const money = (cents: number) => "$" + (cents / 100).toFixed(2),
  percent = (ratio: number) => (ratio * 100).toFixed(1) + "%";
const audience = { light: "Occasional visitors", all: "Everyone", heavy: "Frequent regulars" } as const;
const goals = [
  "Appreciate my returning customers without exceeding my budget.",
  "Bring back regulars who haven't visited in a while.",
  "Get new customers to a second and third visit.",
];
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
    [goal, setGoal] = useState(initial?.input.goal ?? goals[0]),
    [compare, setCompare] = useState<string[]>([]),
    [pending, start] = useTransition();
  const propose = (form: FormData) =>
    start(async () => {
      setError("");
      const response = await proposeDesign(form);
      if (response.result) {
        setResult(response.result);
        setCompare([]);
      } else setError(response.error ?? "Design unavailable.");
    });
  const ok = result?.cards.filter((c) => c.acceptable) ?? [];
  const widest = ok.length > 1 ? ok.reduce((a, b) => (b.metrics.shareReaching > a.metrics.shareReaching ? b : a)).params.id : undefined;
  const cheapest = ok.length > 1 ? ok.reduce((a, b) => (b.metrics.monthlyCostCents < a.metrics.monthlyCostCents ? b : a)).params.id : undefined;
  const compared = result?.cards.filter((c) => compare.includes(c.params.id)) ?? [];
  return (
    <section className="flex flex-col gap-5" aria-labelledby="designer-title">
      <div>
        <h2 id="designer-title" className="section-title">
          Design with your history
        </h2>
        <p className="caption" style={{ fontSize: 14 }}>
          Turn your goal and history into three proposals. You choose the rule; the backtest supplies the arithmetic.{" "}
          <a href="/ai" target="_blank" rel="noreferrer">
            Why these numbers?
          </a>
        </p>
      </div>
      <form action={propose} className="card card-pad form-stack">
        <input type="hidden" name="merchantId" value={merchantId} />
        <label className="field">
          <span className="field-label">Your goal</span>
          <textarea
            className="textarea"
            name="goal"
            maxLength={300}
            required
            rows={2}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Goal suggestions">
          {goals.map((g) => (
            <button key={g} type="button" className="chip chip-neutral chip-choice" aria-pressed={goal === g} onClick={() => setGoal(g)}>
              {g}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Monthly reward budget</span>
            <span className="affix">
              <span className="affix-text">$</span>
              <input
                name="budget"
                type="number"
                inputMode="decimal"
                min="1"
                max="100000"
                step=".01"
                required
                className="num"
                defaultValue={(initial?.input.budgetCents ?? 15000) / 100}
              />
            </span>
          </label>
          <label className="field">
            <span className="field-label">Gross margin</span>
            <span className="affix">
              <input
                name="margin"
                type="number"
                min="1"
                max="100"
                step=".1"
                className="num"
                defaultValue={initial?.input.marginPct ?? margin}
                required
              />
              <span className="affix-text">%</span>
            </span>
          </label>
          <label className="field">
            <span className="field-label">Assumed sales lift: {lift}%</span>
            <input
              name="lift"
              type="range"
              min={3}
              max={10}
              step={1}
              value={lift}
              onChange={(e) => setLift(Number(e.target.value))}
              style={{ minHeight: 44 }}
            />
            <span className="field-help">Assumption only; field evidence spans 2–6%. This is not measured growth.</span>
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={pending || !enabled} aria-busy={pending || undefined}>
            {pending ? <span className="spinner" aria-hidden="true" /> : <Icon name="sparkles" size={16} />}
            {pending ? "Designing three programs…" : "Propose three programs"}
          </button>
          {pending && (
            <span role="status" className="caption" style={{ fontSize: 14 }}>
              Reading your history, proposing, simulating and explaining…
            </span>
          )}
          {!enabled && (
            <span className="caption" style={{ fontSize: 14 }}>
              AI is unavailable. Presets and template copy still work.
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
      </form>

      {result && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="caption" style={{ fontSize: 14 }}>
              {result.fallbackReason ??
                (result.fallback
                  ? "Some AI output failed validation; template explanations are shown."
                  : "Parameters and explanations passed local validation.")}
            </span>
            {result.includesDemoHistory && (
              <Chip tone="demo" size="sm">
                Includes demo history · {percent(result.demoShare)} of simulated visits
              </Chip>
            )}
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
            {result.cards.map((card) => {
              const { params: p, metrics: m } = card;
              const spec = candidateSpec(p);
              const badge = p.id === widest ? "Widest reach" : p.id === cheapest ? "Lowest cost" : undefined;
              return (
                <article key={p.id} className="card card-pad flex flex-col gap-3.5" aria-labelledby={`card-${p.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="eyebrow">
                      Option {p.id} · {audience[p.who_it_favors]}
                    </span>
                    {badge && (
                      <Chip tone="success" size="sm">
                        {badge}
                      </Chip>
                    )}
                  </div>
                  <div>
                    <h3 id={`card-${p.id}`} className="card-title">
                      {p.name}
                    </h3>
                    <p className="display" style={{ fontStretch: "125%", fontWeight: 800, fontSize: 20, lineHeight: 1.15, marginTop: 4 }}>
                      {programHeadline(spec)}
                    </p>
                    <p className="caption" style={{ fontSize: 13 }}>
                      Within {p.window_days} days · {money(p.min_ticket_cents)} minimum
                    </p>
                  </div>
                  {spec.type === "VISIT_MILESTONE" ? (
                    <PunchRow target={spec.n} filled={0} rewardCents={spec.rewardCents} size="sm" />
                  ) : (
                    <SpendBar current={0} target={spec.spendCents} rewardCents={spec.rewardCents} />
                  )}
                  <dl className="grid grid-cols-3 gap-2">
                    <div>
                      <dt className="caption">Monthly cost</dt>
                      <dd className="num" style={{ fontWeight: 700 }}>
                        {money(m.monthlyCostCents)}
                      </dd>
                    </div>
                    <div>
                      <dt className="caption">Would earn</dt>
                      <dd className="num" style={{ fontWeight: 700 }}>
                        {percent(m.shareReaching)}
                      </dd>
                      <dd className="caption">
                        {m.earners} of {m.customers}
                      </dd>
                    </div>
                    <div>
                      <dt className="caption">First reward</dt>
                      <dd className="num" style={{ fontWeight: 700 }}>
                        {m.medianDaysToFirstReward === null ? "No earner" : `${m.medianDaysToFirstReward.toFixed(1)} days`}
                      </dd>
                    </div>
                  </dl>
                  <Meter
                    value={m.gmvRatio}
                    max={0.06}
                    guideline={0.03}
                    limit={0.05}
                    label={`Reward cost ${percent(m.gmvRatio)} of revenue; ${m.gmvRatio <= 0.03 ? "within" : "above"} the 3% guideline`}
                    labels={[
                      { at: 0, text: `${percent(m.gmvRatio)} of revenue` },
                      { at: 0.03, text: "3%" },
                      { at: 0.05, text: "5%" },
                    ]}
                  />
                  <p className="caption" style={{ fontSize: 13 }}>
                    {m.gmvRatio <= 0.03 ? "Within the 3% revenue guideline." : "Above the 3% revenue guideline."} Needs about{" "}
                    {m.requiredLiftPct.toFixed(1)}% more sales to break even at your margin; at the {lift}% assumption it{" "}
                    {lift >= m.requiredLiftPct ? "would" : "would not"} break even.
                  </p>
                  {!!card.warnings.length && (
                    <ul className="flex flex-wrap gap-1.5">
                      {card.warnings.map((w) => (
                        <li key={w}>
                          <Chip tone="warn" size="sm" icon="alert">
                            {w}
                          </Chip>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p style={{ fontSize: 14.5, lineHeight: 1.55 }}>{card.explanation.pitch}</p>
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--forest)" }}>More numbers</summary>
                    <div className="flex flex-col gap-2" style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.5 }}>
                      <p>{card.explanation.rationale}</p>
                      <p className="caption" style={{ fontSize: 13.5 }}>
                        {card.explanation.tradeoff}
                      </p>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        {[
                          ["Visits that earn a reward", percent(m.refundCountRatio)],
                          ["Share to heaviest 10%", percent(m.top10RewardShare)],
                          ["Break-even lift", m.requiredLiftPct.toFixed(1) + "%"],
                          ["Stopped by limits", String(m.budgetBlocked)],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className="caption">{label}</dt>
                            <dd className="num" style={{ fontWeight: 600 }}>
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </details>
                  <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={!card.acceptable}
                      onClick={() => onUse(spec, result.id, p.id, lift)}
                    >
                      Use this design
                    </button>
                    <label className="check" style={{ fontSize: 14 }}>
                      <input
                        type="checkbox"
                        checked={compare.includes(p.id)}
                        onChange={(e) =>
                          setCompare(e.target.checked ? [...compare, p.id] : compare.filter((id) => id !== p.id))
                        }
                      />
                      <span>Compare</span>
                    </label>
                  </div>
                  {!card.acceptable && (
                    <p className="caption" style={{ color: "var(--danger)" }}>
                      Rejected by the simulation ceiling.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          {compared.length >= 2 && <CompareTable cards={compared} />}
        </div>
      )}
    </section>
  );
}

function CompareTable({ cards }: { cards: DesignResult["cards"] }) {
  const rows: { label: string; value: (c: DesignResult["cards"][number]) => number | null; show: (v: number | null) => string; better: "low" | "high" }[] = [
    { label: "Monthly cost", value: (c) => c.metrics.monthlyCostCents, show: (v) => money(v ?? 0), better: "low" },
    { label: "Would earn", value: (c) => c.metrics.shareReaching, show: (v) => percent(v ?? 0), better: "high" },
    { label: "First reward (median days)", value: (c) => c.metrics.medianDaysToFirstReward, show: (v) => (v === null ? "No earner" : v.toFixed(1)), better: "low" },
    { label: "Cost of revenue", value: (c) => c.metrics.gmvRatio, show: (v) => percent(v ?? 0), better: "low" },
    { label: "Visits that earn a reward", value: (c) => c.metrics.refundCountRatio, show: (v) => percent(v ?? 0), better: "low" },
    { label: "Share to heaviest 10%", value: (c) => c.metrics.top10RewardShare, show: (v) => percent(v ?? 0), better: "low" },
    { label: "Break-even lift", value: (c) => c.metrics.requiredLiftPct, show: (v) => `${(v ?? 0).toFixed(1)}%`, better: "low" },
  ];
  return (
    <div className="card table-wrap">
      <table className="table">
        <caption className="sr-only">Comparison of the selected designs</caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            {cards.map((c) => (
              <th key={c.params.id} scope="col" className="right">
                {c.params.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const values = cards.map(row.value);
            const valid = values.filter((v): v is number => v !== null);
            const best = valid.length ? (row.better === "low" ? Math.min(...valid) : Math.max(...valid)) : undefined;
            return (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {values.map((v, i) => (
                  <td key={cards[i].params.id} className="right num" style={{ fontWeight: v !== null && v === best ? 700 : 400 }}>
                    {row.show(v)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
