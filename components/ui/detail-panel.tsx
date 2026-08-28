"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { fade, spring } from "@/lib/motion";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/**
 * A right-hand detail drawer: the "open the thing and see everything about it"
 * surface, the way Asana, Linear and Things all do it.
 *
 * Distinct from `Modal` on purpose. A modal is a short interruption you finish
 * and dismiss (confirm this, fill this in). A detail panel is a place you stay:
 * you read, tick a step, change a date, and the list stays visible beside it so
 * you keep your place. Editing a task ONLY through a centred form modal meant
 * the list vanished behind a scrim every time you wanted to look at something.
 *
 * Slides from the right on desktop and up from the bottom on mobile, where a
 * side sheet would be unreachable. Keeps the focus trap, Escape, backdrop
 * click, scroll lock, and focus restoration.
 */
export function DetailPanel({
  open,
  onClose,
  title,
  eyebrow,
  headerActions,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Rendered by the caller inside `children` when it is editable. */
  title: string;
  eyebrow?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Matches Tailwind's `sm`. Below it the panel is a bottom sheet, above it a
  // side panel, and the entrance has to travel along the matching axis.
  const isDesktop = useMediaQuery("(min-width: 640px)");

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];

    /*
     * Focus the panel itself, NOT the first control inside it.
     *
     * Focusing the first focusable put the caret straight into the task's name
     * field, so opening a task to read it looked exactly like being dropped
     * into renaming it: a focus ring around the title and a live cursor, on a
     * panel the user opened to look at subtasks. Nobody asked to edit.
     *
     * The panel still takes focus, so the Escape and Tab handling below keeps
     * working and a screen reader still lands inside the dialog. Editing the
     * name is now what it should be: click the name.
     */
    panel?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        /*
         * Only if nothing nearer the user has already dealt with it.
         *
         * This listener is on `document`, so a React `stopPropagation` inside
         * the panel never reaches it: the inline subtask composer cancelled
         * itself on Escape and the panel then closed the whole task on the same
         * keypress, taking the half-typed step with it.
         *
         * `defaultPrevented` is the signal that already travels with the event,
         * so an inner control that calls `preventDefault` when it handles
         * Escape is respected without the panel needing to know it exists.
         */
        if (event.defaultPrevented) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
          <motion.div
            className="absolute inset-0 bg-overlay"
            onClick={onClose}
            aria-hidden
            variants={fade}
            initial="hidden"
            animate="visible"
            exit="exit"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            // Focusable programmatically, never a tab stop of its own.
            tabIndex={-1}
            // Slides in from the edge it actually lives on: the side on
            // desktop, straight up from the bottom on mobile. Animating `x` on
            // both left the mobile sheet arriving sideways and parked
            // off-centre, with the list still showing down one edge.
            initial={isDesktop ? { opacity: 0, x: "100%" } : { opacity: 0, y: "100%" }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={isDesktop ? { opacity: 0, x: "100%" } : { opacity: 0, y: "100%" }}
            transition={spring.snappy}
            className={cn(
              // `max-w-full` + `min-w-0` matter: without them a wide field
              // inside could push the sheet past the viewport on a phone.
              "glass-thick relative z-10 flex h-[92vh] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-t-4xl shadow-e3",
              "sm:h-full sm:w-[560px] sm:max-w-[92vw] sm:rounded-none sm:rounded-l-3xl",
              className,
            )}
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-separator px-5 py-4">
              <div className="min-w-0 flex-1">
                {eyebrow ? <div className="mb-1.5">{eyebrow}</div> : null}
                <h2 id={titleId} className="sr-only">
                  {title}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {headerActions}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close details"
                  className="hit-44 flex size-7 cursor-pointer items-center justify-center rounded-full bg-fill-tertiary text-label-secondary transition-colors hover:text-label focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </header>

            <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-5">
              {children}
            </div>

            {footer ? (
              <footer className="shrink-0 border-t border-separator px-5 py-3">{footer}</footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/** A labelled row inside a detail panel: fixed-width label, value fills. */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-9 items-center gap-3", className)}>
      <span className="w-24 shrink-0 text-subhead text-label-secondary">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
