"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { updateThemeAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/lib/use-mounted";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  // The resolved theme only exists in the browser (next-themes reads the class
  // its pre-paint script applied). Rendering the real icon during SSR made the
  // server emit Moon while the client wanted Sun, which failed hydration for the
  // WHOLE shell on every page and forced a full client re-render. Render a
  // neutral, identical placeholder until mounted instead.
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      // Keep it out of the a11y tree until it can describe its real action.
      aria-hidden={!mounted}
      tabIndex={mounted ? undefined : -1}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => {
        if (!mounted) return;
        const next = isDark ? "light" : "dark";
        setTheme(next); // instant, no flash
        void updateThemeAction(next); // keep the saved preference in sync
      }}
    >
      <span className={mounted ? undefined : "opacity-0"}>
        {isDark ? <Sun /> : <Moon />}
      </span>
    </Button>
  );
}
