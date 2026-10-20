"use client";
import { useActionState, useRef, useState, type ReactNode } from "react";
import { preset } from "@/lib/merchant-inputs";
import { rewardNote, type ProgramSpec } from "@/lib/engine/program";
import type { Metrics } from "@/lib/engine/simulate";
import { submitProgram } from "./actions";
import DesignerPanel from "./designer-panel";
import ScribePanel from "./scribe-panel";
import type { DesignResult } from "@/lib/ai/designer/pipeline";
import { ConfirmButton } from "@/components/form-controls";
import { Meter, PunchRow, SpendBar } from "@/components/ui";
import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";
import { money, pct, programHeadline } from "@/lib/format";
const presets = [
  ["cafe", "Cafe", "5 visits, $2 back"],
  ["salon", "Salon", "4 visits, $5 back"],
  ["bakery", "Bakery", "$40 spent, $3 back"],
] as const;
const settlementWords: Record<ProgramSpec["settlement"], string> = {
  INSTANT: "right after the visit",
  DELAYED: "24 hours after the visit",
  REVIEW: "after you review each one",
};
function Group({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <fieldset className="card card-pad form-stack" style={{ minWidth: 0 }}>
      <legend className="sr-only">{title}</legend>
      <div aria-hidden="true">
        <p className="card-title">{title}</p>
        {help && (
          <p className="caption" style={{ fontSize: 13.5, marginTop: 2 }}>
            {help}
          </p>
        )}
      </div>
      {children}
    </fieldset>
  );
}
function MoneyField({
  name,
  label,
  value,
  onChange,
  max,
  min = "0",
  help,
}: {
  name: string;
  label: string;
  value: number;
  onChange: (value: string) => void;
  max?: string;
  min?: string;
  help?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="affix">
        <span className="affix-text">$</span>
        <input
          name={name}
          type="number"
          inputMode="decimal"
          step=".01"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="num"
        />
      </span>
      {help && <span className="field-help">{help}</span>}
    </label>
  );
}
/** Changes between the live program and the edited rule, in words. */
function changes(live: ProgramSpec, next: ProgramSpec) {
  const out: string[] = [];
  const m = (c: number) => money(c);
  if (live.type !== next.type)
    out.push(`Earn by ${next.type === "VISIT_MILESTONE" ? "visits" : "amount spent"} instead of ${live.type === "VISIT_MILESTONE" ? "visits" : "amount spent"}`);
  else if (live.type === "VISIT_MILESTONE" && next.type === "VISIT_MILESTONE" && live.n !== next.n)
    out.push(`Visits per reward: ${live.n} → ${next.n}`);
  else if (live.type === "SPEND_MILESTONE" && next.type === "SPEND_MILESTONE" && live.spendCents !== next.spendCents)
    out.push(`Spend per reward: ${m(live.spendCents)} → ${m(next.spendCents)}`);
  const pairs: [string, number, number, (v: number) => string][] = [
    ["Reward", live.rewardCents, next.rewardCents, m],
    ["Smallest qualifying purchase", live.minTicketCents, next.minTicketCents, m],
    ["Window", live.windowDays, next.windowDays, (v) => `${v} days`],
    ["Purchases merged within", live.mergeWindowMin, next.mergeWindowMin, (v) => `${v} minutes`],
    ["Limit per customer each month", live.perCustomerMonthlyCapCents, next.perCustomerMonthlyCapCents, m],
    ["Daily budget", live.dailyBudgetCents, next.dailyBudgetCents, m],
    ["Monthly budget", live.monthlyBudgetCents, next.monthlyBudgetCents, m],
  ];
  for (const [label, a, b, f] of pairs) if (a !== b) out.push(`${label}: ${f(a)} → ${f(b)}`);
  if (live.settlement !== next.settlement) out.push(`Rewards are sent ${settlementWords[next.settlement]}`);
  if (!!live.winBack !== !!next.winBack) out.push(next.winBack ? "Welcome-back reward turned on" : "Welcome-back reward turned off");
  else if (live.winBack && next.winBack && JSON.stringify(live.winBack) !== JSON.stringify(next.winBack))
    out.push("Welcome-back reward settings changed");
  if (JSON.stringify(live.noteVariants ?? []) !== JSON.stringify(next.noteVariants ?? [])) out.push("Thank-you notes changed");
  return out;
}
export default function ProgramForm({
  category,
  initial,
  merchantId,
  aiEnabled = false,
  margin = 60,
  initialDesign,
  merchantName = "your business",
  live,
  returnTo,
}: {
  category: string;
  merchantId: string;
  initial?: ProgramSpec;
  aiEnabled?: boolean;
  margin?: number;
  initialDesign?: DesignResult & { id: string };
  merchantName?: string;
  live?: ProgramSpec;
  returnTo?: "program";
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
  const [backtest, setBacktest] = useState<{ status: "idle" | "running" | "done" | "error"; metrics?: Metrics; for?: string }>({
    status: "idle",
  });
  const editor = useRef<HTMLDivElement>(null);
  const change = (field: string, value: string, isMoney = false) =>
    setSpec({
      ...spec,
      [field]: isMoney ? Math.round(Number(value) * 100) : Number(value),
    } as ProgramSpec);
  const simulate = async (body: ProgramSpec) => {
    const r = await fetch("/api/analyst/simulate_rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: body }),
    });
    if (!r.ok) throw new Error();
    return (await r.json()) as Metrics;
  };
  const specKey = JSON.stringify(spec);
  const tested = backtest.status === "done" && backtest.for === specKey ? backtest.metrics : undefined;
  let notePreview = "";
  try {
    notePreview = rewardNote({ ...spec, noteVariants: spec.noteVariants?.filter(Boolean) } as ProgramSpec, merchantName, spec.noteVariants?.filter(Boolean).length ? "preview" : undefined);
  } catch {
    notePreview = "";
  }
  const diff = live ? changes(live, spec) : [];
  return (
    <div className="flex flex-col gap-8">
      <DesignerPanel
        merchantId={merchantId}
        enabled={aiEnabled}
        margin={margin}
        initial={initialDesign}
        onUse={(chosen, runId, candidateId, liftAssumptionPct) => {
          setSpec(chosen);
          setDesignRef({ runId, candidateId, liftAssumptionPct });
          setScribeRef("");
          editor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          toast("Design loaded. Review the rule, then activate it.");
        }}
      />
      <form action={action} className="flex flex-col gap-5">
        <div ref={editor} className="flex flex-wrap items-end justify-between gap-3" style={{ scrollMarginTop: 24 }}>
          <div>
            <h2 className="section-title">Edit the rule</h2>
            <p className="caption" style={{ fontSize: 14 }}>
              Existing visits carry forward. Refunds start with milestones reached after activation.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="caption" id="preset-label">
              Start from a preset instead
            </span>
            <div className="seg" role="group" aria-labelledby="preset-label">
              {presets.map(([item, label, detail]) => (
                <button
                  type="button"
                  className="seg-item"
                  key={item}
                  aria-pressed={choice === item && !designRef.runId}
                  title={detail}
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
                  {label} · {detail}
                </button>
              ))}
            </div>
          </div>
        </div>
        <input name="merchantId" type="hidden" value={merchantId} />
        <input name="designRunId" type="hidden" value={designRef.runId} />
        <input name="candidateId" type="hidden" value={designRef.candidateId} />
        <input name="approvedLift" type="hidden" value={designRef.liftAssumptionPct} />
        <input name="scribeRunId" type="hidden" value={scribeRef} />
        <input name="termsIntro" type="hidden" value={spec.termsIntro ?? ""} />
        <input name="workedExamples" type="hidden" value={JSON.stringify(spec.workedExamples ?? [])} />
        <input name="signPitch" type="hidden" value={spec.signPitch ?? ""} />
        <input type="hidden" name="preset" value={choice} />
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

        <div className="setup-grid">
          <div className="setup-main">
            <Group title="How customers earn">
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Earn by</span>
                  <select
                    className="select"
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
                  <label className="field">
                    <span className="field-label">Visits per reward</span>
                    <input
                      className="input num"
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
                  <MoneyField
                    name="spend"
                    label="Spend per reward"
                    min=".01"
                    value={spec.spendCents / 100}
                    onChange={(v) => change("spendCents", v, true)}
                  />
                )}
                <label className="field">
                  <span className="field-label">Window</span>
                  <span className="affix">
                    <input
                      name="window"
                      type="number"
                      min={1}
                      max={365}
                      value={spec.windowDays}
                      onChange={(e) => change("windowDays", e.target.value)}
                      required
                      className="num"
                    />
                    <span className="affix-text">days</span>
                  </span>
                  <span className="field-help">Visits count toward a card for this long.</span>
                </label>
                <MoneyField
                  name="minimum"
                  label="Smallest qualifying purchase"
                  value={spec.minTicketCents / 100}
                  onChange={(v) => change("minTicketCents", v, true)}
                />
              </div>
            </Group>

            <Group title="Reward">
              <div className="form-grid">
                <MoneyField
                  name="reward"
                  label="Reward"
                  max="25"
                  value={spec.rewardCents / 100}
                  onChange={(v) => change("rewardCents", v, true)}
                  help="Sent as a partial refund of the visit that completes the card."
                />
                <label className="field">
                  <span className="field-label">Send rewards</span>
                  <select
                    className="select"
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
            </Group>

            <Group title="Limits" help="Rewards stop for the day or month once a limit is reached.">
              <div className="form-grid">
                <MoneyField
                  name="customerCap"
                  label="Per customer each month"
                  value={spec.perCustomerMonthlyCapCents / 100}
                  onChange={(v) => change("perCustomerMonthlyCapCents", v, true)}
                />
                <MoneyField
                  name="daily"
                  label="Daily budget"
                  value={spec.dailyBudgetCents / 100}
                  onChange={(v) => change("dailyBudgetCents", v, true)}
                />
                <MoneyField
                  name="monthly"
                  label="Monthly budget"
                  value={spec.monthlyBudgetCents / 100}
                  onChange={(v) => change("monthlyBudgetCents", v, true)}
                />
              </div>
            </Group>

            <Group title="Fine-tuning">
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Combine nearby payments</span>
                  <span className="affix">
                    <input
                      name="merge"
                      type="number"
                      min={30}
                      max={240}
                      value={spec.mergeWindowMin}
                      onChange={(e) => change("mergeWindowMin", e.target.value)}
                      required
                      className="num"
                    />
                    <span className="affix-text">minutes</span>
                  </span>
                  <span className="field-help">Payments this close together count as one visit.</span>
                </label>
                {spec.type === "VISIT_MILESTONE" && (
                  <label className="field">
                    <span className="field-label">Starting progress (first card only)</span>
                    <input
                      className="input num"
                      name="endowedProgress"
                      type="number"
                      min={0}
                      max={Math.min(18, spec.n - 2)}
                      value={spec.endowedProgress ?? 0}
                      onChange={(e) => change("endowedProgress", e.target.value)}
                    />
                    <span className="field-help">At least two actual qualifying visits are always required.</span>
                  </label>
                )}
              </div>
            </Group>

            <Group title="Welcome-back reward" help="Optional. Thank returning regulars after a long gap.">
              <label className="check">
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
                />
                <span>Thank returning regulars after a long gap</span>
              </label>
              {spec.winBack && (
                <>
                  <div className="form-grid">
                    <label className="field">
                      <span className="field-label">Gap in days</span>
                      <select
                        className="select"
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
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <MoneyField
                      name="winBackReward"
                      label="Reward"
                      min="1"
                      max={String(Math.min(10, spec.rewardCents / 100))}
                      value={spec.winBack.rewardCents / 100}
                      onChange={(v) =>
                        setSpec({
                          ...spec,
                          winBack: {
                            ...spec.winBack!,
                            rewardCents: Math.round(Number(v) * 100),
                          },
                        })
                      }
                    />
                    <label className="field">
                      <span className="field-label">Previous qualifying visits</span>
                      <input
                        className="input num"
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
                  </div>
                  <p className="caption" style={{ fontSize: 13.5 }}>
                    At most once per 180 days. A regular milestone takes precedence. Existing caps and budgets apply;
                    imported history never triggers a retroactive payment.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        setWinBackEstimate("Backtesting…");
                        try {
                          const m = await simulate(spec);
                          setWinBackEstimate(
                            `${m.winBackRewards} welcome-back rewards / $${(m.winBackCostCents / 100).toFixed(2)} over 90 days.${m.demoShare > 0 ? " Includes demo history." : ""}`,
                          );
                        } catch {
                          setWinBackEstimate("Estimate unavailable. Check the rule and limits.");
                        }
                      }}
                    >
                      Estimate welcome-back cost
                    </button>
                    <p role="status" className="status-line">
                      {winBackEstimate}
                    </p>
                  </div>
                </>
              )}
            </Group>

            <Group title="Thank-you notes" help="Shown in the customer's PayPal or Venmo activity with each reward.">
              <ScribePanel
                merchantId={merchantId}
                spec={spec}
                onUse={(chosen, id) => {
                  setSpec(chosen);
                  setScribeRef(id);
                }}
              />
              <label className="field">
                <span className="field-label">Notes, one per line</span>
                <textarea
                  className="textarea"
                  name="noteVariants"
                  maxLength={1000}
                  rows={4}
                  value={(spec.noteVariants ?? []).join("\n")}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      noteVariants: e.target.value ? e.target.value.split("\n") : [],
                    })
                  }
                  aria-describedby="notes-help"
                />
                <span id="notes-help" className="field-help">
                  Include “loyalty reward”, the business name and the milestone. Leave blank to use the template.
                </span>
              </label>
              {notePreview && (
                <div className="flex flex-col gap-1" style={{ padding: "12px 14px", borderRadius: 12, background: "var(--surface-2)" }}>
                  <span className="eyebrow">How a note reads</span>
                  <span style={{ fontSize: 14.5 }}>{notePreview}</span>
                </div>
              )}
              {(spec.termsIntro || spec.signPitch) && (
                <dl className="flex flex-col gap-2" style={{ fontSize: 14 }}>
                  {spec.termsIntro && (
                    <div>
                      <dt className="caption">Terms introduction</dt>
                      <dd>{spec.termsIntro}</dd>
                    </div>
                  )}
                  {spec.signPitch && (
                    <div>
                      <dt className="caption">Sign pitch</dt>
                      <dd>{spec.signPitch}</dd>
                    </div>
                  )}
                </dl>
              )}
              {!!spec.noteVariants?.length && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm self-start"
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
            </Group>
          </div>

          <aside className="setup-aside" style={{ position: "sticky", top: 24 }}>
            <div className="card card-highlight card-pad flex flex-col gap-4">
              <p className="eyebrow">Summary</p>
              <p className="display" style={{ fontStretch: "125%", fontWeight: 800, fontSize: 24, lineHeight: 1.1 }}>
                {programHeadline(spec)}
              </p>
              {spec.type === "VISIT_MILESTONE" ? (
                <PunchRow target={spec.n} filled={0} rewardCents={spec.rewardCents} size="sm" />
              ) : (
                <SpendBar current={0} target={spec.spendCents} rewardCents={spec.rewardCents} />
              )}
              <p className="text-2" style={{ fontSize: 14, lineHeight: 1.55 }}>
                Visits from {money(spec.minTicketCents)} count within {spec.windowDays} days. Rewards are sent{" "}
                {settlementWords[spec.settlement]}, up to {money(spec.perCustomerMonthlyCapCents)} per customer each
                month.
              </p>
              <div className="flex flex-col gap-2" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <div className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Backtest on your history</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={backtest.status === "running"}
                    onClick={async () => {
                      const key = specKey;
                      setBacktest({ status: "running" });
                      try {
                        setBacktest({ status: "done", metrics: await simulate(spec), for: key });
                      } catch {
                        setBacktest({ status: "error" });
                      }
                    }}
                  >
                    {backtest.status === "running" ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" size={14} />}
                    {tested ? "Run again" : "Run"}
                  </button>
                </div>
                <div role="status" className="flex flex-col gap-2">
                  {tested ? (
                    <>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <div>
                          <dt className="caption">Monthly cost</dt>
                          <dd className="num" style={{ fontWeight: 700, fontSize: 17 }}>
                            {money(tested.monthlyCostCents)}
                          </dd>
                        </div>
                        <div>
                          <dt className="caption">Would earn</dt>
                          <dd className="num" style={{ fontWeight: 700, fontSize: 17 }}>
                            {pct(tested.shareReaching)}
                            <span className="caption" style={{ fontWeight: 500 }}>
                              {" "}
                              {tested.earners} of {tested.customers}
                            </span>
                          </dd>
                        </div>
                      </dl>
                      <Meter
                        value={tested.gmvRatio}
                        max={0.06}
                        guideline={0.03}
                        limit={0.05}
                        label={`Reward cost ${pct(tested.gmvRatio)} of qualifying revenue; guideline 3%, limit 5%`}
                        labels={[
                          { at: 0, text: `${pct(tested.gmvRatio)} of revenue` },
                          { at: 0.05, text: "5% limit" },
                        ]}
                      />
                      {tested.demoShare > 0 && <span className="caption">Includes demo history.</span>}
                    </>
                  ) : (
                    <span className="caption">
                      {backtest.status === "error"
                        ? "Backtest unavailable. Check the rule and limits."
                        : backtest.status === "running"
                          ? "Backtesting…"
                          : "See the cost and reach of this rule on your past sales."}
                    </span>
                  )}
                </div>
              </div>
              {state.error && (
                <p role="alert" className="alert">
                  {state.error}
                </p>
              )}
              {live ? (
                <ConfirmButton
                  className="btn btn-primary btn-block"
                  disabled={pending}
                  title="Activate this program?"
                  body={
                    diff.length ? (
                      <>
                        <p>Changes from the live program:</p>
                        <ul>
                          {diff.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                        <p>Customers keep their progress. New rules apply to milestones reached after activation.</p>
                      </>
                    ) : (
                      <p>This matches the live program. Activating saves it as a new version.</p>
                    )
                  }
                  confirmLabel="Activate program"
                >
                  {pending && <span className="spinner" aria-hidden="true" />}
                  {pending ? "Activating…" : "Activate program"}
                </ConfirmButton>
              ) : (
                <button type="submit" className="btn btn-primary btn-block" disabled={pending} aria-busy={pending || undefined}>
                  {pending && <span className="spinner" aria-hidden="true" />}
                  {pending ? "Activating…" : "Activate program"}
                </button>
              )}
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
}
