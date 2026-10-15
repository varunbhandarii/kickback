"use client";
import { useEffect, useMemo, useCallback, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import {
  AgStudioAiModule,
  enableStudioDevValidations,
  type AgStudioStateUpdatedEvent,
  type AgStudioErrorRaisedEvent,
  type AgReportState,
  type AgPanelConfig,
  type AgStudioApi,
  type AgStudioApiReadyEvent,
  type AgDefaultRegistry,
  type AgWidgetsConfig,
} from "ag-studio";
import { cockpitData } from "@/lib/studio/data";
import { defaultState } from "@/lib/studio/default-state";
import { analyst } from "@/lib/studio/analyst";
import {
  cockpitWidgets,
  type KickbackRegistry,
} from "@/lib/studio/widgets/registry";
import { cockpitTheme } from "@/lib/studio/theme";
import type { CockpitContext } from "@/lib/studio/context";
if (process.env.NODE_ENV !== "production") enableStudioDevValidations();
const modules = [AgStudioAiModule],
  layout = { minWidth: 720 };
export default function StudioHost({
  context,
  initialState,
  customize,
  aiEnabled,
  dark,
  onState,
  onFatal,
  onError,
  onReady,
}: {
  context: CockpitContext;
  initialState?: unknown;
  customize: boolean;
  aiEnabled: boolean;
  dark: boolean;
  onState: (s: unknown) => void;
  onFatal: () => void;
  onError: (m: string) => void;
  onReady: (api: AgStudioApi) => void;
}) {
  const [data] = useState(() => cockpitData()),
    [business] = useState(context),
    [state] = useState(() => {
      const template = defaultState(context),
        saved = initialState
          ? (structuredClone(initialState) as AgReportState<KickbackRegistry>)
          : template;
      // Keep the fixed KPI window and rule current when an older layout is reopened.
      const page = saved.pages[0];
      if (page.widgets?.rule)
        page.widgets.rule = template.pages[0].widgets!.rule;
      for (const id of ["paid", "cost", "visits", "held", "trend"])
        if (page.widgets?.[id]) {
          page.filter ??= {};
          page.filter.widget ??= {};
          page.filter.widget[id] = template.pages[0].filter!.widget![id];
        }
      return saved;
    });
  const panels = useMemo<AgPanelConfig>(
    () => ({
      edit: {
        left: ["filters"],
        right: [
          ...(aiEnabled ? ["ai" as const] : []),
          ...(customize ? ["edit" as const, "data" as const] : []),
        ],
      },
    }),
    [customize, aiEnabled],
  );
  const ai = useMemo(
    () => (aiEnabled ? analyst(business, onError) : undefined),
    [aiEnabled, business, onError],
  );
  const update = useCallback(
    (e: AgStudioStateUpdatedEvent) => onState(e.state),
    [onState],
  );
  const ready = useCallback(
    (event: AgStudioApiReadyEvent) => onReady(event.api),
    [onReady],
  );
  const widgets = useCallback(
    (defaults: AgWidgetsConfig<AgDefaultRegistry>) => ({
      ...cockpitWidgets,
      menu: [...cockpitWidgets.menu, ...defaults.menu],
    }),
    [],
  );
  const error = useCallback(
    (e: AgStudioErrorRaisedEvent) => {
      if (e.fatal) {
        console.warn("Cockpit layout unavailable", {
          type: e.errorType,
          count: e.errorDetails.length,
        });
        onFatal();
      }
    },
    [onFatal],
  );
  useEffect(() => {
    document.body.dataset.agThemeMode = dark ? "dark" : "light";
    return () => {
      delete document.body.dataset.agThemeMode;
    };
  }, [dark]);
  return (
    <AgStudioProvider
      modules={modules}
      licenseKey={process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY ?? ""}
    >
      <div
        className="studio-surface"
        style={{ height: "78vh", minHeight: 640, width: "100%" }}
      >
        <AgStudio<KickbackRegistry>
          widgets={widgets}
          data={data}
          initialState={state}
          mode="edit"
          panels={panels}
          layout={layout}
          context={business}
          theme={cockpitTheme}
          ai={ai}
          onStateUpdated={update}
          onErrorRaised={error}
          onApiReady={ready}
        />
      </div>
    </AgStudioProvider>
  );
}
