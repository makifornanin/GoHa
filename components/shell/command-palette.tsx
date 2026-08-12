"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Brain,
  CornerDownLeft,
  ListChecks,
  Moon,
  Plus,
  Search,
  Shapes,
  Sun,
  Target,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { loadCommandIndexAction, type CommandTarget } from "@/app/(app)/search-actions";
import { primaryNav } from "@/lib/nav";
import { spring } from "@/lib/motion";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";

type Command = {
  id: string;
  label: string;
  hint?: string;
  group: "Actions" | "Go to" | "Tasks" | "Goals" | "Life areas";
  icon: LucideIcon;
  run: () => void;
};

/**
 * Case-insensitive subsequence match, the standard palette feel: "tdo" finds
 * "To-dos". Returns a score so earlier and tighter matches rank first, and
 * -1 when the query does not match at all.
 */
function fuzzyScore(text: string, query: string): number {
  if (query === "") return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();

  const direct = haystack.indexOf(needle);
  if (direct >= 0) return 1000 - direct * 2 - (haystack.length - needle.length);

  let score = 0;
  let cursor = -1;
  for (const char of needle) {
    const next = haystack.indexOf(char, cursor + 1);
    if (next === -1) return -1;
    // Adjacent characters are worth more than scattered ones.
    score += next === cursor + 1 ? 6 : 1;
    cursor = next;
  }
  return score;
}

/**
 * The keyboard route through the app.
 *
 * GoHa is dense enough that reaching anything meant a sidebar click plus a
 * filter change. This collapses navigation, the four things people actually
 * start (a task, a focus session, a captured thought, a theme switch) and a
 * search across the user's own tasks, goals and life areas into one surface.
 *
 * The searchable index is fetched lazily on first open and then kept for the
 * session, so the palette costs nothing until it is used.
 */
export function CommandPalette() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [targets, setTargets] = useState<CommandTarget[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Opening is an EVENT, not a synchronisation, so all of its state changes
   * happen here rather than in an effect reacting to `open`. That keeps the
   * reset and the one-time fetch on the same code path as the keystroke and
   * avoids the cascading renders an effect-driven version causes.
   */
  const requestedIndex = useRef(false);
  const openPalette = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
    if (requestedIndex.current) return;
    requestedIndex.current = true;
    setLoading(true);
    loadCommandIndexAction()
      .then(setTargets)
      .catch(() => setTargets([]))
      .finally(() => setLoading(false));
  }, []);

  const close = useCallback(() => setOpen(false), []);

  // Cmd/Ctrl+K anywhere. Escape to close is handled on the dialog itself.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) close();
        else openPalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, openPalette, close]);

  // Purely external side effects: scroll lock, focus, focus restoration.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus after paint so the input exists.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const commands = useMemo<Command[]>(() => {
    const actions: Command[] = [
      {
        id: "action-new-task",
        label: "New task",
        hint: "Open the task form",
        group: "Actions",
        icon: Plus,
        run: () => go("/tasks?new=1"),
      },
      {
        id: "action-focus",
        label: "Start a focus session",
        group: "Actions",
        icon: Timer,
        run: () => go("/focus"),
      },
      {
        id: "action-capture",
        label: "Capture a thought",
        hint: "Brain Dump",
        group: "Actions",
        icon: Brain,
        run: () => go("/brain-dump"),
      },
      {
        id: "action-theme",
        label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        group: "Actions",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        run: () => {
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
          close();
        },
      },
    ];

    const navigation: Command[] = primaryNav.map((item) => ({
      id: `nav-${item.href}`,
      label: item.label,
      group: "Go to",
      icon: item.icon,
      run: () => go(item.href),
    }));

    const KIND: Record<
      CommandTarget["kind"],
      { group: Command["group"]; icon: LucideIcon; href: string }
    > = {
      task: { group: "Tasks", icon: ListChecks, href: "/tasks" },
      goal: { group: "Goals", icon: Target, href: "/goals" },
      "life-area": { group: "Life areas", icon: Shapes, href: "/life-areas" },
    };

    const records: Command[] = (targets ?? []).map((target) => {
      const meta = KIND[target.kind];
      return {
        id: `${target.kind}-${target.id}`,
        label: target.title,
        hint: target.hint,
        group: meta.group,
        icon: meta.icon,
        run: () => go(meta.href),
      };
    });

    return [...actions, ...navigation, ...records];
  }, [go, resolvedTheme, setTheme, close, targets]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed === "") {
      // Empty query: actions and navigation only. Dumping every task into an
      // untouched palette buries the things people open it to do.
      return commands.filter((c) => c.group === "Actions" || c.group === "Go to");
    }
    return commands
      .map((command) => ({ command, score: fuzzyScore(command.label, trimmed) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 24)
      .map((r) => r.command);
  }, [commands, query]);

  // Clamp rather than reset, so typing never leaves the highlight out of range.
  const safeIndex = Math.min(activeIndex, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${safeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [safeIndex]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (results.length === 0 ? 0 : (i - 1 + results.length) % results.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      results[safeIndex]?.run();
    }
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div
            className="absolute inset-0 bg-overlay"
            onClick={close}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, scale: 0.98, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={spring.snappy}
            onKeyDown={onKeyDown}
            className="glass-thick relative z-10 flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl shadow-e3"
          >
            <div className="flex items-center gap-3 border-b border-separator px-4">
              <Search className="size-4 shrink-0 text-label-tertiary" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                placeholder="Search tasks, goals, or jump to a screen..."
                aria-label="Search commands"
                className="h-12 w-full bg-transparent text-body text-label outline-none placeholder:text-label-tertiary"
              />
              <kbd className="hidden shrink-0 rounded-md bg-fill-tertiary px-1.5 py-0.5 font-mono text-footnote text-label-secondary sm:block">
                esc
              </kbd>
            </div>

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center text-callout text-label-secondary">
                  {loading ? "Loading your work..." : `Nothing matches “${query}”.`}
                </p>
              ) : (
                results.map((command, index) => {
                  const Icon = command.icon;
                  const previous = results[index - 1];
                  const showGroup = !previous || previous.group !== command.group;
                  const active = index === safeIndex;
                  return (
                    <div key={command.id}>
                      {showGroup ? (
                        <p className="px-3 pb-1 pt-3 text-caption uppercase text-label-tertiary">
                          {command.group}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        data-index={index}
                        onMouseMove={() => setActiveIndex(index)}
                        onClick={() => command.run()}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                          active ? "bg-blue text-white" : "text-label hover:bg-surface-hover",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            active ? "text-white" : "text-label-tertiary",
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-body">{command.label}</span>
                        {command.hint ? (
                          <span
                            className={cn(
                              "shrink-0 truncate text-footnote",
                              active ? "text-white/70" : "text-label-tertiary",
                            )}
                          >
                            {command.hint}
                          </span>
                        ) : null}
                        {active ? (
                          <CornerDownLeft className="size-3.5 shrink-0 text-white/70" aria-hidden />
                        ) : null}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
