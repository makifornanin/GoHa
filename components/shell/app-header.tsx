"use client";

import { Focus, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ThemeToggle } from "./theme-toggle";

/** Desktop top toolbar: `glass-thin` chrome (spec section 5). */
export function AppHeader({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <header
      className={cn(
        "glass-thin sticky top-0 z-30 h-14 items-center justify-end gap-2 border-0 border-b border-b-glass-border px-6",
        className,
      )}
    >
      {/* A shortcut nobody knows about does not exist. This is the palette's
          discoverable surface; it dispatches the same Cmd/Ctrl+K the shell
          listens for, so there is one code path and no duplicated state. */}
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
          )
        }
        aria-label="Open command palette"
        className="mr-auto flex h-8 cursor-pointer items-center gap-2 rounded-lg bg-fill-tertiary pl-2.5 pr-2 text-left text-body text-label-tertiary transition-colors hover:bg-fill-secondary focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 lg:w-64"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden flex-1 lg:inline">Search or jump to...</span>
        <kbd className="hidden shrink-0 rounded-md bg-fill-tertiary px-1.5 font-mono text-footnote lg:block">
          ⌘K
        </kbd>
      </button>

      <Button variant="secondary" onClick={() => router.push("/focus")}>
        <Focus />
        <span className="hidden lg:inline">Focus Mode</span>
      </Button>
      {/*
        No create button here.

        The sidebar's "+ Add" is the global create affordance and sits about
        78px below this bar in the same chrome, so a second one made two
        near-identical primary buttons compete inside one viewport; on /tasks
        the page header added a third. Creating a task is still reachable from
        everywhere it was: the sidebar, the page header on /tasks, the mobile
        "+", the command palette, and clicking a day in the calendar. This bar
        keeps what is unique to it, search and Focus Mode.
      */}

      <div className="mx-2 h-5 w-px bg-separator" />

      <ThemeToggle />
    </header>
  );
}
