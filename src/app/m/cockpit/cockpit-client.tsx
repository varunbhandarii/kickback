"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useSyncExternalStore,
  useMemo,
} from "react";
import type { CockpitContext } from "@/lib/studio/context";
import type { AgStudioApi } from "ag-studio";
import { saveCockpitState, resetCockpitState } from "./actions";
import { Icon } from "@/components/icons";
import { State } from "@/components/ui";
import { Popover } from "@/components/shell/popover";
import { useThemeChoice } from "@/components/shell/theme-switch";
const StudioHost = dynamic(() => import("./studio-host"), {
  ssr: false,
  loading: () => (
    <p role="status" className="status-line" style={{ padding: 24 }}>
      <span className="spinner" aria-hidden="true" />
      Loading your cockpit…
    </p>
  ),
});
function useMedia(query: string, server: boolean) {
  const store = useMemo(
    () => ({
      subscribe: (notify: () => void) => {
        const m = matchMedia(query);
        m.addEventListener("change", notify);
        return () => m.removeEventListener("change", notify);
      },
      snapshot: () => matchMedia(query).matches,
      server: () => server,
    }),
    [query, server],
  );
  return useSyncExternalStore(store.subscribe, store.snapshot, store.server);
}
const pages = [
  ["loyalty", "Loyalty"],
  ["risk", "Risk"],
] as const;
export default function CockpitClient({
  context,
  initialState,
  invalidState,
  ai,
}: {
  context: CockpitContext;
  initialState?: unknown;
  invalidState: boolean;
  ai: boolean;
}) {
  const narrow = useMedia("(max-width: 719px)", true),
    preferredDark = useMedia("(prefers-color-scheme: dark)", false),
    theme = useThemeChoice();
  const [custom, setCustom] = useState(false),
    [generation, setGeneration] = useState(0),
    [state, setState] = useState(initialState),
    [failed, setFailed] = useState(false),
    [recovered, setRecovered] = useState(invalidState),
    [message, setMessage] = useState("");
  const [pageId, setPageId] = useState("loyalty");
  // Studio follows the app theme: the saved choice, or the device setting.
  const dark = theme === "dark" || (theme === "system" && preferredDark);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    studio = useRef<AgStudioApi | undefined>(undefined),
    latest = useRef<unknown>(state),
    queue = useRef(Promise.resolve());
  useEffect(() => () => clearTimeout(timer.current), []);
  const ready = useCallback((api: AgStudioApi) => {
    studio.current = api;
    setPageId(api.getState().selectedPageId);
  }, []);
  const fatal = useCallback(() => setFailed(true), []);
  const persist = useCallback((next: unknown) => {
    setPageId((next as { selectedPageId: string }).selectedPageId);
    latest.current = next;
    clearTimeout(timer.current);
    setMessage("Saving layout…");
    timer.current = setTimeout(() => {
      queue.current = queue.current
        .catch(() => {})
        .then(() => saveCockpitState(next));
      queue.current.then(
        () => setMessage("Layout saved"),
        () => setMessage("Layout could not be saved. Please retry."),
      );
    }, 1500);
  }, []);
  const reset = async () => {
    clearTimeout(timer.current);
    await queue.current.catch(() => {});
    await resetCockpitState();
    latest.current = undefined;
    setState(undefined);
    setFailed(false);
    setRecovered(false);
    setGeneration((v) => v + 1);
    setMessage("Default layout restored");
  };
  const select = (id: string) => {
    const api = studio.current;
    if (api) api.setState({ ...api.getState(), selectedPageId: id });
  };
  if (narrow)
    return (
      <section className="cockpit" style={{ padding: "8px 0" }}>
        <div className="card">
          <State
            icon="cockpit"
            title="The Cockpit needs a wider screen"
            action={
              <Link href="/m" className="btn btn-primary">
                Open overview
              </Link>
            }
          >
            <p>Your overview has the same numbers and works on this screen.</p>
          </State>
        </div>
      </section>
    );
  const done = ["Layout saved", "Default layout restored", "Data refreshed"].includes(message);
  const problem = message.startsWith("Layout could not");
  return (
    <section className="cockpit" aria-labelledby="cockpit-title">
      <div className="cockpit-head">
        <h1 id="cockpit-title" className="cockpit-title">
          Cockpit
        </h1>
        <div role="tablist" aria-label="Cockpit pages" className="seg">
          {pages.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="seg-item"
              id={`cockpit-tab-${id}`}
              aria-controls="cockpit-panel"
              aria-selected={pageId === id}
              tabIndex={pageId === id ? 0 : -1}
              onKeyDown={(e) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? "loyalty"
                      : e.key === "End"
                        ? "risk"
                        : id === "loyalty"
                          ? "risk"
                          : "loyalty";
                  studio.current?.setState({
                    ...studio.current.getState(),
                    selectedPageId: next,
                  });
                  document.getElementById(`cockpit-tab-${next}`)?.focus();
                }
              }}
              onClick={() => select(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {context.demo && (
          <span
            className="chip chip-demo chip-sm"
            title="Includes demo history (synthetic and replay). Backtests describe that history, not future sales."
          >
            Includes demo data
          </span>
        )}
        <div className="cockpit-tools">
          <p
            aria-live="polite"
            role="status"
            className="status-line"
            style={problem ? { color: "var(--danger)" } : undefined}
          >
            {message === "Saving layout…" && <span className="spinner" aria-hidden="true" />}
            {done && <Icon name="check" size={14} strokeWidth={2.5} style={{ color: "var(--forest)" }} />}
            {message}
          </p>
          <button
            type="button"
            className="icon-btn"
            aria-label="Refresh data"
            title="Refresh data"
            onClick={() => {
              studio.current?.reload();
              setMessage("Data refreshed");
            }}
          >
            <Icon name="refresh" size={16} />
          </button>
          <button
            type="button"
            className={`btn btn-sm ${custom ? "btn-primary" : "btn-secondary"}`}
            onClick={() => {
              setState(latest.current);
              setCustom((v) => !v);
              setGeneration((v) => v + 1);
            }}
            aria-pressed={custom}
          >
            <Icon name="sliders" size={14} />
            Customize
          </button>
          <Popover label="More cockpit actions" triggerClassName="icon-btn" trigger={<Icon name="more" size={16} />}>
            <button type="button" className="menu-item" onClick={() => void reset()}>
              <Icon name="history" size={16} />
              Reset layout
            </button>
            <button type="button" className="menu-item" onClick={() => window.print()}>
              <Icon name="printer" size={16} />
              Print this page
            </button>
            <div className="menu-divider" role="separator" />
            <p className="caption" style={{ padding: "6px 10px 8px", maxWidth: 260 }}>
              Dates use {context.tz}.
              {context.demo &&
                " Includes demo history (synthetic and replay); backtests describe that history, not future sales."}
            </p>
          </Popover>
        </div>
      </div>
      {(!ai || recovered) && (
        <div className="flex flex-col gap-2" style={{ padding: "10px clamp(16px, 2vw, 24px) 0" }}>
          {!ai && (
            <p className="caption" style={{ fontSize: 13.5 }}>
              The analyst is unavailable in this deployment. Your charts and tables still work.
            </p>
          )}
          {recovered && (
            <p role="alert" className="banner banner-warn">
              Your saved layout couldn&apos;t be read, so the default has been restored.
            </p>
          )}
        </div>
      )}
      {failed ? (
        <div role="alert" className="card" style={{ margin: 24 }}>
          <State
            icon="alert"
            tone="danger"
            title="The layout could not be loaded"
            as="h2"
            action={
              <button type="button" className="btn btn-primary" onClick={() => void reset()}>
                Reset layout
              </button>
            }
          >
            <p>Resetting restores the default Cockpit. Your data is not affected.</p>
          </State>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="cockpit-panel"
          aria-labelledby={`cockpit-tab-${pageId}`}
        >
          <StudioHost
            key={generation}
            context={context}
            initialState={state}
            customize={custom}
            aiEnabled={ai}
            dark={dark}
            onState={persist}
            onFatal={fatal}
            onError={setMessage}
            onReady={ready}
          />
        </div>
      )}
    </section>
  );
}
