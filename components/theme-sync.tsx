"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

/**
 * Seeds next-themes from the persisted `user_settings.theme` the first time this
 * device is used (when it has no local choice yet). It never overrides an
 * existing local preference, so a returning user sees no flash: next-themes has
 * already applied their stored theme before paint. This is what makes the saved
 * theme authoritative across devices without a hydration flash.
 */
export function ThemeSync({ dbTheme }: { dbTheme: "light" | "dark" | "system" }) {
  const { setTheme } = useTheme();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    try {
      if (localStorage.getItem("theme") == null) setTheme(dbTheme);
    } catch {
      // Private mode / storage disabled: fall back to next-themes' own handling.
    }
  }, [dbTheme, setTheme]);

  return null;
}
