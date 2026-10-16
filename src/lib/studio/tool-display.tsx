import type { AgAiToolDetailParams, AgAiToolLabelParams } from "ag-studio";
import type { AgAiToolDisplay } from "ag-studio-react";
const money = (n: unknown) => `$${(Number(n ?? 0) / 100).toFixed(2)}`;
export function toolLabel(text: string, p: AgAiToolLabelParams) {
  return {
    text,
    pill:
      p.status === "done"
        ? p.result?.success
          ? "Complete"
          : "Unavailable"
        : p.status === "cancelled"
          ? "Cancelled"
          : "Working",
  };
}
function Data({ name, result }: AgAiToolDetailParams) {
  if (!result) return <p role="status">Reading business data…</p>;
  if (!result.success) return <p>Data unavailable. Retry the question.</p>;
  const d = (result.data ?? {}) as Record<string, unknown>;
  if (name === "simulate_rules")
    return (
      <table>
        <caption>
          Retrospective backtest
          {Number(d.demoShare) > 0 ? " · includes demo history" : ""}
        </caption>
        <tbody>
          {[
            ["Monthly reward cost", money(d.monthlyCostCents)],
            ["Earners", `${d.earners ?? 0} / ${d.customers ?? 0}`],
            [
              "Share reaching",
              `${(Number(d.shareReaching ?? 0) * 100).toFixed(1)}%`,
            ],
            [
              "Break-even lift",
              d.requiredLiftPct === undefined
                ? "Unavailable"
                : `${Number(d.requiredLiftPct).toFixed(1)}%`,
            ],
          ].map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  if (name === "explain_customer")
    return (
      <div aria-label="Regular ledger">
        <p>
          {d.found === false
            ? "Regular not found"
            : `${d.visits ?? 0} completed visits · ${d.status ?? "status unavailable"}`}
        </p>
        <ol>
          {(
            (d.ledger ?? []) as {
              at: string;
              amountCents: number;
              source: string;
            }[]
          )
            .slice(0, 50)
            .map((row, i) => (
              <li key={i}>
                {row.at.slice(0, 10)} · {money(row.amountCents)}
                {row.source === "REPLAY" ? " · demo" : ""}
              </li>
            ))}
        </ol>
      </div>
    );
  if (name === "program_metrics")
    return (
      <p>
        {Number(d.payments ?? 0)} payments · {Number(d.rewardsPaid ?? 0)}{" "}
        rewards sent · {money(d.costCents)} · {Number(d.pendingReviews ?? 0)}{" "}
        pending reviews{d.includesDemoHistory ? " · includes demo history" : ""}
      </p>
    );
  if (name === "flag_abuse")
    return (
      <ul>
        {(
          (d.flags ?? []) as {
            score: number;
            decision: string;
            reasons: string[];
          }[]
        )
          .slice(0, 50)
          .map((row, i) => (
            <li key={i}>
              Score {row.score} · {row.decision}: {row.reasons?.join(", ")}
            </li>
          ))}
      </ul>
    );
  if (name === "design_program")
    return (
      <p>
        Proposals are ready for review.{" "}
        <a href="/m/onboarding/program">Review program proposals</a>. Nothing
        has been activated.
      </p>
    );
  return <p>Business data loaded.</p>;
}
export const toolDisplay: Record<string, AgAiToolDisplay> = Object.fromEntries(
  Object.entries({
    simulate_rules: "Backtesting the rule",
    explain_customer: "Reading a regular's ledger",
    program_metrics: "Reading program activity",
    flag_abuse: "Reading review signals",
    design_program: "Preparing program proposals",
  }).map(([name, text]) => [
    name,
    { label: (p: AgAiToolLabelParams) => toolLabel(text, p), detail: Data },
  ]),
);
for (const [name, text] of Object.entries({
  execute_query: "Querying the data",
  view_schema: "Reading the schema",
  view_report: "Reading the report",
  view_loyalty_page: "Reading Loyalty",
  view_risk_page: "Reading Risk",
  set_date_window: "Setting the date window",
  cohort_metrics: "Reading repeat-visit cohorts",
}))
  toolDisplay[name] = { label: (p) => toolLabel(text, p) };
