"use client";
import { useEffect, useState } from "react";
import { Icon } from "./icons";

const EVENT = "kb-toast";
/** Show a short confirmation in the shared polite live region. */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }));
}

export function Toaster() {
  const [item, setItem] = useState<{ id: number; message: string } | null>(null);
  useEffect(() => {
    const show = (event: Event) =>
      setItem({ id: Date.now(), message: (event as CustomEvent<string>).detail });
    window.addEventListener(EVENT, show);
    return () => window.removeEventListener(EVENT, show);
  }, []);
  useEffect(() => {
    if (!item) return;
    const timer = window.setTimeout(() => setItem(null), 4000);
    return () => window.clearTimeout(timer);
  }, [item]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {item && (
        <div key={item.id} className="toast">
          <Icon name="check" size={16} strokeWidth={2.5} style={{ color: "var(--mint)", flex: "none" }} />
          <span>{item.message}</span>
        </div>
      )}
    </div>
  );
}

/** Copies a value and confirms with a toast. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      className="icon-btn icon-btn-plain"
      style={{ width: 30, height: 30 }}
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast("Copied");
        } catch {
          toast("Couldn't copy. Select the text instead.");
        }
      }}
    >
      <Icon name="copy" size={14} />
    </button>
  );
}
