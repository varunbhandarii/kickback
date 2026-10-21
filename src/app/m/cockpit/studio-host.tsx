"use client";
import { useEffect, useMemo, useCallback, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import {
  AgStudioAiModule,
  enableStudioDevValidations,
  type AgStudioStateUpdatedEvent,
  type AgStudioErrorRaisedEvent,
  type AgPanelConfig,
  type AgStudioApi,
  type AgStudioApiReadyEvent,
  type AgDefaultRegistry,
  type AgWidgetsConfig,
} from "ag-studio";
import { cockpitData } from "@/lib/studio/data";
import { restoreLayout } from "@/lib/studio/layout";
import { analyst } from "@/lib/studio/analyst";
import {
  cockpitWidgets,
  type KickbackRegistry,
} from "@/lib/studio/widgets/registry";
import { cockpitTheme } from "@/lib/studio/theme";
import { toolDisplay } from "@/lib/studio/tool-display";
import type { CockpitContext } from "@/lib/studio/context";
if (process.env.NODE_ENV !== "production") enableStudioDevValidations();
const modules = [AgStudioAiModule],
  layout = { minWidth: 720 };
const localeText = { panelTitleAi: "Analyst" };
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
      try {
        return restoreLayout(initialState, context);
      } catch {
        return null;
      }
    });
  useEffect(() => {
    if (!state) onFatal();
  }, [state, onFatal]);
  // Host metadata is persisted alongside Studio state, whose parser strips unknown properties.
  const [dateWindow] = useState(() => {
    let days = state?.kpiDays ?? 30;
    return {
      read: () => days,
      write: (value: number) => {
        days = value;
      },
    };
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
    () =>
      aiEnabled ? analyst(business, onError, dateWindow.write) : undefined,
    [aiEnabled, business, onError, dateWindow],
  );
  const update = useCallback(
    (e: AgStudioStateUpdatedEvent) =>
      onState({ ...e.state, kpiDays: dateWindow.read() }),
    [onState, dateWindow],
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
  if (!state) return null;
  return (
    <AgStudioProvider
      modules={modules}
      licenseKey={process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY ?? ""}
    >
      <div className="studio-surface" style={{ width: "100%" }}>
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
          aiToolDisplay={toolDisplay}
          localeText={localeText}
          onStateUpdated={update}
          onErrorRaised={error}
          onApiReady={ready}
        />
      </div>
    </AgStudioProvider>
  );
}
