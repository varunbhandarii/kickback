import {
  AgAiCommandError,
  type AgStudioApi,
  type AgReportState,
} from "ag-studio";
import type { CockpitContext } from "./context";
import type { KickbackRegistry } from "./widgets/registry";
import { withDateWindow } from "./layout";
export function setDateWindowTool(
  api: AgStudioApi,
  c: CockpitContext,
  onWindowDays?: (days: number) => void,
) {
  const command = api.defineAiCommand((s) => ({
    input: s.object({
      days: s.number({
        description:
          "Integer days, 1–365, ending today in the merchant's time zone.",
      }),
    }),
    execute: ({ days }) => {
      if (!Number.isInteger(days) || days < 1 || days > 365)
        return {
          success: false,
          error: new AgAiCommandError({
            code: "invalid_input",
            message: "days must be an integer 1–365",
          }),
        };
      const studio = api as unknown as AgStudioApi<KickbackRegistry>;
      onWindowDays?.(days);
      studio.setState(
        withDateWindow(
          studio.getState() as AgReportState<KickbackRegistry>,
          days,
          c.asOfDay ?? new Date().toISOString().slice(0, 10),
        ),
      );
      return { success: true, value: { days } };
    },
  }));
  return api.defineAiTool({
    name: "set_date_window",
    description:
      "Set and persist the Loyalty KPI/trend window; does not change any program.",
    command,
    result: (v) => ({
      response: `Window set to the last ${v.days} days.`,
      data: v,
    }),
  });
}
