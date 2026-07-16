"use client";

import { AnimatePresence, motion, type Variants } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { fade, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Modal choreography (spec section 9): scale 0.94 -> 1 with fade, snappy. */
const panelVariants: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.94, transition: spring.smooth },
};

/**
 * Accessible modal per spec section 8: width 480, radius 20, padding 24,
 * `glass-thick` material. The overlay is rgba(0,0,0,0.32) with NO blur (the
 * sheet carries the glass). Bottom sheet (radius 26 top) on mobile. Keeps the
 * focus trap, Escape, backdrop click, scroll lock, and focus restoration.
 *
 * `layoutId`: when provided (and matched by a motion trigger element with the
 * same id), the modal MORPHS from its trigger instead of fading (spec:
 * "morph, do not fade").
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  initialFocus,
  layoutId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Returns the element to focus when the dialog opens (e.g. the first field). */
  initialFocus?: () => HTMLElement | null;
  /** Shared-element id for a morph-from-trigger open. */
  layoutId?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

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

    (initialFocus?.() ?? focusables()[0] ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
  }, [open, onClose, initialFocus]);

  const morphProps = layoutId
    ? { layoutId, transition: spring.snappy }
    : {
        variants: panelVariants,
        initial: "hidden" as const,
        animate: "visible" as const,
        exit: "exit" as const,
      };

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
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
            aria-describedby={description ? descriptionId : undefined}
            {...morphProps}
            className={cn(
              "glass-thick relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-4xl shadow-e3 sm:max-w-[480px] sm:rounded-3xl",
              className,
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-separator px-6 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-title-3 text-label">
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-1 text-callout text-label-secondary">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="hit-44 -mr-2 -mt-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface-secondary text-label-secondary transition-colors hover:text-label focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
