"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { updateThemeAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Server and the first client render both resolve to Moon (resolvedTheme is
  // undefined until the provider mounts), so there is no hydration mismatch;
  // the icon updates once the resolved theme is known.
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => {
        const next = isDark ? "light" : "dark";
        setTheme(next); // instant, no flash
        void updateThemeAction(next); // keep the saved preference in sync
      }}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
