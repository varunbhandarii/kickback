"use client";
import { createContext, useContext, type ReactNode } from "react";

const ReadOnly = createContext(false);

/** Marks everything below as the read-only demo. The server enforces it independently. */
export function ReadOnlyProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <ReadOnly.Provider value={value}>{children}</ReadOnly.Provider>;
}

export function useReadOnly() {
  return useContext(ReadOnly);
}

/** Disables every form control inside when the visitor is in the read-only demo. */
export function DemoLock({ children }: { children: ReactNode }) {
  const readOnly = useReadOnly();
  if (!readOnly) return <>{children}</>;
  return (
    <fieldset disabled className="demo-lock" title="Turned off in the read-only demo">
      {children}
    </fieldset>
  );
}

/** Renders children only for owners (hides controls that make no sense read-only). */
export function OwnerOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return useReadOnly() ? <>{fallback}</> : <>{children}</>;
}
