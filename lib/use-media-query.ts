"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches.
 *
 * Layout belongs in CSS, but a few things genuinely cannot be expressed there:
 * a motion animation has to know whether a sheet slides up from the bottom or in
 * from the side, and that is a JS value, not a class.
 *
 * `useSyncExternalStore` keeps server and client renders consistent: the server
 * snapshot is always `false`, so the markup matches and there is no hydration
 * mismatch, and the real value arrives on the first client render.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
