import type { AgReportState } from "ag-studio";
import type { CockpitContext } from "./context";
import type { KickbackRegistry } from "./widgets/registry";
import { cohortCaption } from "./measurement";
export function defaultState(
  c: CockpitContext,
): AgReportState<KickbackRegistry> {
  const field = (id: string) => ({ id }),
    sum = (id: string) => ({ id, aggregation: "sum" as const });
  const title = (text: string) => ({ title: { text, enabled: true } });
  const lastDay = c.asOfDay ?? "1970-01-01",
    firstDay = new Date(lastDay + "T00:00Z");
  firstDay.setUTCDate(firstDay.getUTCDate() - 29);
  const state: AgReportState<KickbackRegistry> = {
    version: "3.0.0",
    selectedPageId: "loyalty",
    pages: [
      {
        id: "loyalty",
        layout: { columns: 24, rowHeight: 32, minWidth: 720 },
        widgets: {
          rule: {
            type: "text",
            dataMapping: {},
            format: {
              ...title("Your program"),
              style: {
                text:
                  c.rule +
                  (c.demo
                    ? " Includes demo history (synthetic and replay)."
                    : ""),
                typography: { fontSize: 16 },
              },
            },
          },
          paid: {
            type: "value",
            dataMapping: {
              value: [sum("daily_summary.rewards_paid")],
              sparklineX: [field("daily_summary.day")],
            },
            format: title("Rewards sent · 30 days"),
          },
          cost: {
            type: "value",
            dataMapping: {
              value: [sum("daily_summary.reward_cost")],
              sparklineX: [field("daily_summary.day")],
            },
            format: title("Reward cost · 30 days"),
          },
          visits: {
            type: "value",
            dataMapping: {
              value: [sum("daily_summary.visits")],
              sparklineX: [field("daily_summary.day")],
            },
            format: title("Visits · 30 days"),
          },
          held: {
            type: "value",
            dataMapping: { value: [sum("daily_summary.held")] },
            format: title("Needs review · 30 days"),
          },
          trend: {
            type: "line-chart",
            dataMapping: {
              categoryKey: [field("daily_summary.day")],
              valueKey: [
                sum("daily_summary.visits"),
                sum("daily_summary.qualifying_visits"),
              ],
            },
            format: title("Visits by day"),
          },
          wallets: {
            type: "donut-chart",
            dataMapping: {
              categoryKey: [field("visits.wallet")],
              valueKey: [{ id: "visits.id", aggregation: "count" }],
            },
            format: title("How customers pay"),
          },
          customers: {
            type: "grid",
            dataMapping: {
              cols: [
                "label",
                "wallets",
                "last_seen",
                "visits_90d",
                "spend_90d",
                "progress_current",
                "progress_target",
                "status_label",
                "is_demo",
              ].map((x) => field("customers." + x)),
            },
            sort: [
              { field: field("customers.progress_pct"), direction: "desc" },
            ],
            format: title("Regulars"),
          },
          rewards: {
            type: "grid",
            dataMapping: {
              cols: [
                "customer_label",
                "state_label",
                "amount",
                "created_at",
                "guard_score",
                "reason",
              ].map((x) => field("rewards." + x)),
            },
            format: title("Needs review"),
          },
          funnel: {
            type: "reward-funnel",
            dataMapping: {
              step: [field("customers.progress_current")],
              count: [{ id: "customers.label", aggregation: "count" }],
            },
            format: title("Reward funnel"),
          },
          ledger: {
            type: "customer-ledger",
            dataMapping: {
              time: [field("visits.started_at")],
              amount: [field("visits.amount")],
              who: [field("visits.customer_label")],
            },
            format: title("Customer ledger"),
          },
        },
        widgetLayout: {
          rule: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 3 },
          paid: { xTrack: 0, yTrack: 3, xSpan: 6, ySpan: 5 },
          cost: { xTrack: 6, yTrack: 3, xSpan: 6, ySpan: 5 },
          visits: { xTrack: 12, yTrack: 3, xSpan: 6, ySpan: 5 },
          held: { xTrack: 18, yTrack: 3, xSpan: 6, ySpan: 5 },
          trend: { xTrack: 0, yTrack: 8, xSpan: 16, ySpan: 10 },
          wallets: { xTrack: 16, yTrack: 8, xSpan: 8, ySpan: 10 },
          customers: { xTrack: 0, yTrack: 18, xSpan: 14, ySpan: 12 },
          rewards: { xTrack: 14, yTrack: 18, xSpan: 10, ySpan: 12 },
          funnel: { xTrack: 0, yTrack: 30, xSpan: 12, ySpan: 12 },
          ledger: { xTrack: 12, yTrack: 30, xSpan: 12, ySpan: 12 },
        },
        filter: {
          widget: {
            ...Object.fromEntries(
              ["paid", "cost", "visits", "held", "trend"].map((id) => [
                id,
                [
                  {
                    field: field("daily_summary.day"),
                    model: {
                      operator: "between",
                      value: [firstDay.toISOString().slice(0, 10), lastDay],
                    },
                  },
                ],
              ]),
            ),
            rewards: [
              {
                field: field("rewards.state"),
                model: { operator: "isIn", value: ["HELD", "FAILED"] },
              },
            ],
          },
        },
      },
    ],
  };
  const page = state.pages[0];
  for (const position of Object.values(page.widgetLayout ?? {}))
    if (position && position.yTrack >= 3) position.yTrack += 6;
  page.widgets!.source = {
    type: "button-filter",
    dataMapping: { value: [field("visits.source")] },
    format: title("Visit source · demo history is labeled"),
  };
  page.widgetLayout!.source = { xTrack: 0, yTrack: 3, xSpan: 24, ySpan: 6 };
  page.widgets!.cohorts = {
    type: "column-chart-grouped",
    dataMapping: {
      categoryKey: [field("cohorts.cohort_month")],
      valueKey: [field("cohorts.rate_60")],
      legendKey: [field("cohorts.period")],
    },
    format: {
      ...title("Second-visit rate by first-visit month"),
      caption: { text: cohortCaption, enabled: true },
    },
  };
  page.widgets!.measurement = {
    type: "text",
    dataMapping: {},
    format: {
      ...title("What we can and cannot measure"),
      style: {
        text:
          cohortCaption +
          " Recent cohorts have incomplete 60-day follow-up. " +
          (c.measurement ??
            "There are too few regulars for a useful lift test. We do not run a holdout."),
        typography: { fontSize: 15 },
      },
    },
  };
  page.widgetLayout!.cohorts = { xTrack: 0, yTrack: 48, xSpan: 24, ySpan: 12 };
  page.widgetLayout!.measurement = {
    xTrack: 0,
    yTrack: 60,
    xSpan: 24,
    ySpan: 7,
  };
  state.pages.push({
    id: "risk",
    layout: { columns: 24, rowHeight: 32, minWidth: 720 },
    widgets: {
      held_grid: {
        type: "grid",
        dataMapping: {
          cols: [
            "state_label",
            "amount",
            "created_at",
            "guard_score",
            "reason",
            "customer_label",
          ].map((x) => field("rewards." + x)),
        },
        format: title("Held, failed and cancelled rewards"),
      },
      ledger2: {
        type: "customer-ledger",
        dataMapping: {
          time: [field("visits.started_at")],
          amount: [field("visits.amount")],
          who: [field("visits.customer_label")],
        },
        format: title("Customer ledger"),
      },
      visits_pivot: {
        type: "pivot-grid",
        dataMapping: {
          rows: [field("visits.weekday")],
          columns: [field("visits.wallet")],
          values: [
            { id: "visits.id", aggregation: "count" },
            sum("visits.amount"),
          ],
        },
        format: {
          ...title("Visits · weekday × wallet"),
          style: { totalColumns: true, grandTotalRow: { enabled: true } },
        },
      },
      ai_runs: {
        type: "value",
        dataMapping: { value: [sum("ai_usage.runs")] },
        format: title("Analyst runs · 30 days"),
      },
      ai_cost: {
        type: "value",
        dataMapping: { value: [sum("ai_usage.cost_cents")] },
        format: title("Analyst cost · 30 days"),
      },
      ai_trend: {
        type: "line-chart",
        dataMapping: {
          categoryKey: [field("ai_usage.day")],
          valueKey: [
            sum("ai_usage.input_tokens"),
            sum("ai_usage.output_tokens"),
          ],
        },
        format: title("Analyst tokens by day"),
      },
    },
    widgetLayout: {
      ai_runs: { xTrack: 0, yTrack: 0, xSpan: 12, ySpan: 5 },
      ai_cost: { xTrack: 12, yTrack: 0, xSpan: 12, ySpan: 5 },
      held_grid: { xTrack: 0, yTrack: 5, xSpan: 24, ySpan: 12 },
      ledger2: { xTrack: 0, yTrack: 17, xSpan: 12, ySpan: 12 },
      visits_pivot: { xTrack: 12, yTrack: 17, xSpan: 12, ySpan: 12 },
      ai_trend: { xTrack: 0, yTrack: 29, xSpan: 24, ySpan: 10 },
    },
    filter: {
      widget: {
        held_grid: [
          {
            field: field("rewards.state"),
            model: { operator: "isIn", value: ["HELD", "FAILED", "CANCELLED"] },
          },
        ],
      },
    },
  });
  return state;
}
