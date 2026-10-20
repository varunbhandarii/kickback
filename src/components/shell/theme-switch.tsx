"use client";
import { useSyncExternalStore } from "react";
import { Icon, type IconName } from "../icons";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "kb-theme",
  EVENT = "kb-theme-change";

function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}
export function applyTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {}
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  window.dispatchEvent(new Event(EVENT));
}
/** The saved choice; "system" on the server and before hydration. */
export function useThemeChoice() {
  return useSyncExternalStore(subscribe, readTheme, () => "system" as const);
}

const options: { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: "system", label: "System", icon: "monitor" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];
export function ThemeSwitch() {
  const choice = useThemeChoice();
  return (
    <div role="group" aria-label="Theme" className="seg" style={{ width: "100%" }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="seg-item"
          style={{ flex: 1, justifyContent: "center" }}
          aria-pressed={choice === o.value}
          onClick={() => applyTheme(o.value)}
        >
          <Icon name={o.icon} size={14} />
          {o.label}
        </button>
      ))}
    </div>
  );
}
