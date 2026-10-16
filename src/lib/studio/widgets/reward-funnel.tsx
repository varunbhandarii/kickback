import { useEffect, useState } from "react";
import type {
  AgWidgetParams,
  AgWidgetFieldReference,
  AgWidgetData,
  AgWidgetDataFormat,
} from "ag-studio";
import type { AgWidgetDefinition } from "ag-studio-react";
import type { CockpitContext } from "../context";
import { customFormatShape } from "./format";
export type RewardFunnelDef = AgWidgetData<
  { step: AgWidgetFieldReference[]; count: AgWidgetFieldReference[] },
  AgWidgetDataFormat<Record<string, never>>
> & { type: "reward-funnel" };
function RewardFunnel(
  p: AgWidgetParams<RewardFunnelDef, unknown, CockpitContext>,
) {
  const [values, setValues] = useState<{ step: number; count: number }[]>([]),
    [error, setError] = useState(false),
    step = p.dataMapping.step?.[0],
    count = p.dataMapping.count?.[0];
  useEffect(() => {
    p.widgetApi.addEventListener("toolbarAction", (e) => {
      if (e.id === "export" && step && count)
        e.startTransition(() =>
          p.widgetApi.exportCsv({ requests: [{ fields: [step, count] }] }),
        );
    });
    return () => p.widgetApi.removeEventListener("toolbarAction");
  }, [p.widgetApi, step, count]);
  useEffect(() => {
    if (!step || !count) return;
    const abort = new AbortController();
    p.widgetApi.setDisplayState("loading", { prominent: !values.length });
    p.widgetApi
      .getData({ fields: [step, count] }, { signal: abort.signal })
      .then((r) => {
        setError(false);
        setValues(
          r.results.rows.map((row) => ({
            step: Number(row[step.key]),
            count: Number(row[count.key]),
          })),
        );
        p.widgetApi.setDisplayState(
          r.results.rows.length ? "displayed" : "noData",
        );
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setError(true);
          p.widgetApi.setDisplayState("displayed");
        }
      });
    return () => abort.abort();
    // Engine refresh supplies a new mapping when page/cross filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.dataMapping, p.widgetApi]);
  if (error)
    return <p role="alert">Funnel data unavailable. Use Refresh to retry.</p>;
  const spec = p.context.spec,
    target = spec.type === "VISIT_MILESTONE" ? spec.n : spec.spendCents,
    buckets = spec.type === "VISIT_MILESTONE" ? target + 1 : 4;
  const counts = Array.from({ length: buckets }, (_, i) =>
    values
      .filter((v) =>
        spec.type === "VISIT_MILESTONE"
          ? v.step === i
          : Math.min(3, Math.floor((v.step / Math.max(1, target)) * 4)) === i,
      )
      .reduce((s, v) => s + v.count, 0),
  );
  const total = counts.reduce((s, c) => s + c, 0),
    max = Math.max(1, ...counts);
  return (
    <div
      style={{ height: "100%", overflow: "auto", padding: 12 }}
      aria-label="Reward funnel"
    >
      <p>Customers at each progress step · {total} wallets</p>
      <svg
        viewBox={`0 0 440 ${buckets * 34 + 10}`}
        role="img"
        aria-label="Customers by reward progress"
      >
        {counts.map((n, i) => (
          <g
            key={i}
            role="button"
            tabIndex={0}
            aria-label={`Progress ${i}: ${n} customers`}
            onClick={() => {
              if (step)
                p.widgetApi.toggleCrossFilter(
                  spec.type === "VISIT_MILESTONE"
                    ? { type: "value", field: step, value: i, group: 0 }
                    : {
                        type: "range",
                        field: step,
                        from: (i * target) / 4,
                        to: ((i + 1) * target) / 4 - 1,
                        group: 0,
                      },
                );
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.currentTarget.dispatchEvent(
                  new MouseEvent("click", { bubbles: true }),
                );
              }
            }}
          >
            <text x={0} y={i * 34 + 20} fill="currentColor">
              {spec.type === "VISIT_MILESTONE"
                ? `${i}/${target}`
                : `${i * 25}–${(i + 1) * 25}%`}
            </text>
            <rect
              x={85}
              y={i * 34 + 3}
              width={Math.max(2, (n / max) * 250)}
              height={24}
              fill="#078767"
            />
            <text x={345} y={i * 34 + 20} fill="currentColor">
              {n} · {total ? ((n / total) * 100).toFixed(0) : 0}%
            </text>
            <title>
              {i > 0 && counts[i - 1]
                ? `Change from previous step: ${(((counts[i - 1] - n) / counts[i - 1]) * 100).toFixed(0)}%`
                : `${n} customers`}
            </title>
          </g>
        ))}
      </svg>
      <p>
        Click a bar to filter regulars. This is current progress, not a
        conversion forecast.
      </p>
    </div>
  );
}
export const rewardFunnel: AgWidgetDefinition<
  "reward-funnel",
  RewardFunnelDef
> = {
  id: "reward-funnel",
  label: "Reward Funnel",
  comp: RewardFunnel,
  defaultSize: { width: 480, height: 280 },
  minSize: { width: 320, height: 200 },
  toolbar: [
    { id: "export", type: "button", label: "Export", icon: "csv" },
    "duplicate",
    "delete",
  ],
  formatShape: customFormatShape,
  dataMapping: {
    step: {
      type: "field",
      supportedRoles: ["numeric", "category"],
      required: true,
      aiDescription:
        "Progress step per customer, usually customers.progress_current.",
    },
    count: {
      type: "field",
      supportedRoles: ["numeric"],
      required: true,
      aiDescription:
        "Customers per step, usually customers.label with aggregation count.",
    },
  },
  form: ({ createDefaults }) =>
    createDefaults({
      dataMappingItems: [
        { key: "step", label: "Progress step" },
        { key: "count", label: "Customers" },
      ],
      supportsCrossHighlight: false,
    }),
  ai: {
    configuration:
      "Map step to customers.progress_current and count to count(customers.label). Format supports a title. Filter customers.wallets for a wallet-specific funnel.",
    description:
      "Customers at each step toward the current reward; shows cohort sizes and drop-off.",
    usage:
      "Use to see where regulars stall. Counts are a snapshot, not measured conversion.",
  },
};
