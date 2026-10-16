import {
  createAiHarness,
  directLlmRunner,
  type AgAiHarnessSetup,
} from "ag-studio";
import { claudeAdapter } from "./claude-adapter";
import { analystTools } from "./analyst-tools";
import { analystInstructions, type CockpitContext } from "./context";
import { historyStore } from "./history-store";
import { analystObserver } from "./telemetry";
import { setDateWindowTool } from "./analyst-commands";
export function analyst(
  c: CockpitContext,
  onError: (m: string) => void,
  onWindowDays?: (days: number) => void,
): AgAiHarnessSetup {
  const adapter = claudeAdapter(onError),
    history = historyStore();
  return ({ api }) =>
    createAiHarness(api, ({ builtIn, tools }) => ({
      agents: [
        ...Object.values(builtIn).map((d) =>
          directLlmRunner({ ...d, adapter }),
        ),
        directLlmRunner({
          id: "kickback-analyst",
          name: "Kickback analyst",
          description:
            "Answers from this business's data and backtests rules. No money actions.",
          adapter,
          schema: (s) => s.undefined(),
          maxTurns: 12,
          instructions: () => analystInstructions(c),
          tools: (ctx) => [
            ctx.studio.viewSchema(),
            ctx.studio.viewReport(),
            ctx.studio.viewPage({
              pageId: "loyalty",
              name: "view_loyalty_page",
              description:
                "Read the Loyalty page's widgets, layout and filters for program activity and cohorts.",
            }),
            ctx.studio.viewPage({
              pageId: "risk",
              name: "view_risk_page",
              description:
                "Read the Risk page's widgets, layout and filters for held rewards, ledger, pivot and Analyst usage.",
            }),
            ctx.studio.executeQuery(),
            ...analystTools(api),
            setDateWindowTool(api, c, onWindowDays),
            tools.delegateTo(["page", "widget", "data", "planning"]),
          ],
          defaultToolCalls: () => [
            { tool: "view_schema" },
            { tool: "program_metrics", args: { days: 30 } },
          ],
        }),
      ],
      primary: "kickback-analyst",
      observers: [analystObserver()],
      history,
      models: [
        {
          id: c.model,
          label: "Claude",
          efforts: [
            { id: "low", label: "Fast" },
            { id: "medium", label: "Balanced" },
            { id: "high", label: "Thorough" },
          ],
        },
      ],
      promptStarters: [
        {
          label: "Who is about to earn next?",
          prompt:
            "Which regulars are closest to their next reward? List codes and progress.",
        },
        {
          label: "Why were rewards held?",
          prompt:
            "Read the Risk page and explain rewards held for review in the last 14 days using risk flags.",
        },
        {
          label: "Cost of a 90-day window",
          prompt:
            "Backtest the current rule with a 90-day window. What is the monthly cost?",
        },
        {
          label: "Visits by weekday chart",
          prompt:
            "Add a column chart of visits by weekday under the customers grid.",
        },
        {
          label: "Summarize this week",
          prompt:
            "Summarize actual program activity over the last 7 days from tools.",
        },
      ],
    }));
}
