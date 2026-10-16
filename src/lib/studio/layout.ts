import type { AgReportState } from "ag-studio";
import type { KickbackRegistry } from "./widgets/registry";
import type { CockpitContext } from "./context";
import { defaultState } from "./default-state";
import { validateState } from "./state";
export const windowedWidgets = ["paid", "cost", "visits", "held", "trend"];
export function withDateWindow(
  state: AgReportState<KickbackRegistry>,
  days: number,
  to: string,
) {
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new Error("days must be 1–365");
  const from = new Date(to + "T00:00Z");
  from.setUTCDate(from.getUTCDate() - days + 1);
  const value = [from.toISOString().slice(0, 10), to];
  const next = structuredClone(state) as AgReportState<KickbackRegistry> & {
    kpiDays: number;
  };
  next.kpiDays = days;
  const page = next.pages.find((p) => p.id === "loyalty");
  if (page) {
    page.filter ??= {};
    page.filter.widget ??= {};
    for (const id of windowedWidgets) {
      const widget = page.widgets?.[id];
      if (!widget) continue;
      page.filter.widget[id] = [
        {
          field: { id: "daily_summary.day" },
          model: { operator: "between", value },
        },
      ];
      if (widget.format?.title?.text)
        widget.format.title.text = widget.format.title.text.replace(
          /\d+ days$/,
          `${days} days`,
        );
    }
  }
  return next;
}
export function restoreLayout(initial: unknown, context: CockpitContext) {
  const template = defaultState(context);
  if (!initial) return { ...template, kpiDays: 30 };
  const valid = validateState(initial),
    saved = structuredClone(
      valid,
    ) as unknown as AgReportState<KickbackRegistry>;
  if (!saved.pages.some((p) => p.id === "risk"))
    saved.pages.push(template.pages.find((p) => p.id === "risk")!);
  const loyalty = saved.pages.find((p) => p.id === "loyalty")!,
    fresh = template.pages.find((p) => p.id === "loyalty")!;
  for (const id of ["rule", "measurement"])
    if (loyalty.widgets?.[id]) loyalty.widgets[id] = fresh.widgets![id];
  // Add the measurement panel when upgrading a layout saved before it existed.
  for (const id of ["cohorts", "measurement"])
    if (!loyalty.widgets?.[id]) {
      loyalty.widgets ??= {};
      loyalty.widgetLayout ??= {};
      loyalty.widgets[id] = fresh.widgets![id];
      const bottom = Math.max(
        0,
        ...Object.values(loyalty.widgetLayout).map((p) =>
          p ? p.yTrack + p.ySpan : 0,
        ),
      );
      loyalty.widgetLayout[id] = {
        ...fresh.widgetLayout![id]!,
        yTrack: bottom + 1,
      };
    }
  return withDateWindow(
    saved,
    valid.kpiDays ?? 30,
    context.asOfDay ?? "1970-01-01",
  );
}
