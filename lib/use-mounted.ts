"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * True only after hydration. SSR-safe (no setState-in-effect), so components
 * whose output depends on browser-only state (resolved theme, matchMedia,
 * localStorage) can render a STABLE placeholder for the server pass and swap in
 * the real value afterwards, instead of mismatching and forcing React to throw
 * away the server HTML.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
