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
const StudioHost = dynamic(() => import("./studio-host"), {
  ssr: false,
  loading: () => <p role="status">Loading your cockpit…</p>,
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
    preferredDark = useMedia("(prefers-color-scheme: dark)", false);
  const [custom, setCustom] = useState(false),
    [generation, setGeneration] = useState(0),
    [state, setState] = useState(initialState),
    [failed, setFailed] = useState(false),
    [recovered, setRecovered] = useState(invalidState),
    [message, setMessage] = useState(""),
    [darkOverride, setDark] = useState<boolean | null>(null);
  const dark = darkOverride ?? preferredDark;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    studio = useRef<AgStudioApi | undefined>(undefined),
    latest = useRef<unknown>(state),
    queue = useRef(Promise.resolve());
  useEffect(() => () => clearTimeout(timer.current), []);
  const ready = useCallback((api: AgStudioApi) => {
    studio.current = api;
  }, []);
  const fatal = useCallback(() => setFailed(true), []);
  const persist = useCallback((next: unknown) => {
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
  return (
    <section className="cockpit">
      <h1>{context.name} · Cockpit</h1>
      <p className="merchant-muted">
        Explore your program and ask the read-only analyst. Dates use{" "}
        {context.tz}.
      </p>
      {context.demo && (
        <p className="merchant-notice">
          Includes demo history (synthetic and replay). Backtests describe that
          history, not future sales.
        </p>
      )}
      <div className="cockpit-toolbar">
        <button
          onClick={() => {
            setState(latest.current);
            setCustom((v) => !v);
            setGeneration((v) => v + 1);
          }}
          aria-pressed={custom}
        >
          Customize
        </button>
        <button onClick={() => void reset()}>Reset layout</button>
        <button
          onClick={() => {
            studio.current?.reload();
            setMessage("Data refreshed");
          }}
        >
          Refresh
        </button>
        <button onClick={() => setDark((v) => !(v ?? preferredDark))}>
          {dark ? "Light theme" : "Dark theme"}
        </button>
        <Link href="/m">Overview</Link>
      </div>
      {!ai && (
        <p>
          Analyst unavailable in this deployment. Your charts and tables still
          work.
        </p>
      )}
      <p aria-live="polite" role="status">
        {message}
      </p>
      {recovered && (
        <p role="alert">
          Saved layout was invalid; the default has been restored.
        </p>
      )}
      {narrow ? (
        <p>
          Open the cockpit on a tablet or desktop.{" "}
          <Link href="/m">Your overview</Link> works on this screen.
        </p>
      ) : failed ? (
        <div role="alert">
          <p>Layout could not be loaded.</p>
          <button onClick={() => void reset()}>Reset layout</button>
        </div>
      ) : (
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
      )}
    </section>
  );
}
