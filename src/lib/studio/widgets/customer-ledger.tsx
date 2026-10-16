import { useEffect, useState } from "react";
import type {
  AgWidgetParams,
  AgWidgetField,
  AgWidgetFieldReference,
  AgWidgetData,
  AgWidgetDataFormat,
} from "ag-studio";
import type { AgWidgetDefinition } from "ag-studio-react";
import { customFormatShape } from "./format";
export type LedgerDef = AgWidgetData<
  {
    time: AgWidgetFieldReference[];
    amount: AgWidgetFieldReference[];
    who: AgWidgetFieldReference[];
  },
  AgWidgetDataFormat<Record<string, never>>
> & { type: "customer-ledger" };
type Dot = {
  who: string;
  time: number;
  amount: number;
  reward: boolean;
  state: string;
  demo: boolean;
  tip: string;
};
function CustomerLedger(p: AgWidgetParams<LedgerDef>) {
  useEffect(() => {
    p.widgetApi.addEventListener("toolbarAction", (e) => {
      const fields = [
        p.dataMapping.time?.[0],
        p.dataMapping.amount?.[0],
        p.dataMapping.who?.[0],
      ].filter((x): x is AgWidgetField => !!x);
      if (e.id === "export" && fields.length === 3)
        e.startTransition(() =>
          p.widgetApi.exportCsv({ requests: [{ fields }] }),
        );
    });
    return () => p.widgetApi.removeEventListener("toolbarAction");
  }, [p.widgetApi, p.dataMapping]);
  const [dots, setDots] = useState<Dot[]>([]),
    [error, setError] = useState(false),
    [end] = useState(() => Date.now());
  useEffect(() => {
    const abort = new AbortController(),
      schema = p.widgetApi.getSchema(),
      field = (id: string) =>
        schema.flatMap((t) => t.fields).find((f) => f.fieldId === id);
    const time = p.dataMapping.time?.[0],
      amount = p.dataMapping.amount?.[0],
      who = p.dataMapping.who?.[0],
      source = field("visits.source"),
      rewardFields = [
        "sent_at",
        "created_at",
        "amount",
        "customer_label",
        "state",
      ].map((k) => field("rewards." + k));
    if (!time || !amount || !who || rewardFields.some((f) => !f)) return;
    p.widgetApi.setDisplayState("loading", { prominent: !dots.length });
    Promise.all([
      p.widgetApi.getData(
        { fields: [time, amount, who, ...(source ? [source] : [])] },
        { queryId: "visits", signal: abort.signal },
      ),
      p.widgetApi.getData(
        { fields: rewardFields as AgWidgetField[] },
        { queryId: "rewards", signal: abort.signal },
      ),
    ])
      .then(([v, r]) => {
        setError(false);
        const [sent, created, cents, label, state] =
          rewardFields as AgWidgetField[];
        const rows: Dot[] = [
          ...v.results.rows.map((row) => ({
            who: String(row[who.key]),
            time: +new Date(row[time.key]),
            amount: Number(row[amount.key]),
            reward: false,
            state: "visit",
            demo: !!source && ["FIXTURE", "REPLAY"].includes(row[source.key]),
            tip:
              p.widgetApi.formatFieldValue(time, row[time.key]) +
              " · " +
              p.widgetApi.formatFieldValue(amount, row[amount.key]),
          })),
          ...r.results.rows.map((row) => ({
            who: String(row[label.key]),
            time: +new Date(row[sent.key] ?? row[created.key]),
            amount: Number(row[cents.key]),
            reward: true,
            state: String(row[state.key]),
            demo: false,
            tip:
              String(row[state.key]) +
              " · " +
              p.widgetApi.formatFieldValue(cents, row[cents.key]),
          })),
        ];
        setDots(rows.filter((d) => Number.isFinite(d.time)));
        p.widgetApi.setDisplayState(rows.length ? "displayed" : "noData");
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setError(true);
          p.widgetApi.setDisplayState("displayed");
        }
      });
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.dataMapping, p.widgetApi]);
  if (error)
    return <p role="alert">Ledger data unavailable. Use Refresh to retry.</p>;
  const start = end - 90 * 86400000,
    visible = dots.filter((d) => d.time >= start && d.time <= end),
    counts = new Map<string, number>();
  for (const d of visible)
    counts.set(d.who, (counts.get(d.who) ?? 0) + (d.reward ? 0 : 1));
  const lanes = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([who]) => who);
  return (
    <div
      style={{ height: "100%", overflow: "auto", padding: 12 }}
      aria-label="Customer ledger"
    >
      {visible.some((d) => d.demo) && <p>Includes demo history</p>}
      <svg
        viewBox={`0 0 620 ${lanes.length * 42 + 32}`}
        role="img"
        aria-label="Visits and rewards over 90 days"
      >
        {lanes.map((who, i) => (
          <g key={who}>
            <text
              x={0}
              y={i * 42 + 23}
              fill="currentColor"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.currentTarget.dispatchEvent(
                    new MouseEvent("click", { bubbles: true }),
                  );
                }
              }}
              onClick={() => {
                const f = p.dataMapping.who?.[0];
                if (f)
                  p.widgetApi.toggleCrossFilter({
                    type: "value",
                    field: f,
                    value: who,
                    group: 0,
                  });
              }}
            >
              {who}
            </text>
            <line
              x1={140}
              x2={605}
              y1={i * 42 + 18}
              y2={i * 42 + 18}
              stroke="#aab8b2"
            />
            {visible
              .filter((d) => d.who === who)
              .map((d, j) => {
                const x = 140 + ((d.time - start) / (end - start)) * 460;
                return d.reward ? (
                  <text
                    key={j}
                    x={x}
                    y={i * 42 + 23}
                    fill={d.state === "CANCELLED" ? "#a33" : "#078767"}
                  >
                    <title>{d.tip}</title>
                    {["SENT", "CONFIRMED"].includes(d.state)
                      ? "✓"
                      : d.state === "CANCELLED"
                        ? "×"
                        : "◔"}
                  </text>
                ) : (
                  <circle
                    key={j}
                    cx={x}
                    cy={i * 42 + 18}
                    r={Math.min(8, Math.max(3, Math.sqrt(d.amount)))}
                    fill={d.demo ? "#8d8aa8" : "#078767"}
                  >
                    <title>{d.tip}</title>
                  </circle>
                );
              })}
          </g>
        ))}
        <text x={140} y={lanes.length * 42 + 20} fill="currentColor">
          90 days ago
        </text>
        <text x={565} y={lanes.length * 42 + 20} fill="currentColor">
          Today
        </text>
      </svg>
      <p>
        Dots: visits. ✓ sent · ◔ pending · × cancelled. Click a regular to
        filter.
      </p>
    </div>
  );
}
export const customerLedger: AgWidgetDefinition<"customer-ledger", LedgerDef> =
  {
    id: "customer-ledger",
    label: "Customer Ledger",
    comp: CustomerLedger,
    defaultSize: { width: 480, height: 280 },
    minSize: { width: 360, height: 200 },
    toolbar: [
      { id: "export", type: "button", label: "Export", icon: "csv" },
      "duplicate",
      "delete",
    ],
    formatShape: customFormatShape,
    dataMapping: {
      time: {
        type: "field",
        supportedRoles: ["temporal"],
        required: true,
        aiDescription: "Visit time, usually visits.started_at.",
      },
      amount: {
        type: "field",
        supportedRoles: ["numeric"],
        required: true,
        aiDescription: "Visit amount, usually visits.amount.",
      },
      who: {
        type: "field",
        supportedRoles: ["category"],
        required: true,
        aiDescription:
          "Pseudonymous regular code, usually visits.customer_label.",
      },
    },
    form: ({ createDefaults }) =>
      createDefaults({
        dataMappingItems: [
          { key: "time", label: "Visit time" },
          { key: "amount", label: "Amount" },
          { key: "who", label: "Regular" },
        ],
        supportsCrossHighlight: false,
      }),
    ai: {
      configuration:
        "Map time to visits.started_at, amount to visits.amount, who to visits.customer_label. Format supports a title.",
      description: "Timeline of visits and rewards per regular",
      usage:
        "Inspect purchase and reward history; filter a regular by clicking the label.",
    },
  };
