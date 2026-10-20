"use client";
import { useSyncExternalStore } from "react";

const none: string[] = [];
let zones: string[] | undefined;
function readZones() {
  try {
    zones ??= Intl.supportedValuesOf("timeZone");
  } catch {
    zones = none;
  }
  return zones;
}
/** IANA time zones from the browser; empty during server rendering. */
export function useTimeZones() {
  return useSyncExternalStore(
    () => () => {},
    readZones,
    () => none,
  );
}
