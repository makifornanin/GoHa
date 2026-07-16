"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";

import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";

const sidePosition: Record<Side, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

/**
 * Tooltip: shows on hover and keyboard focus after a short delay. Popover
 * material (`glass-regular`), footnote type, snappy spring in/out. Wraps a
 * single interactive child (which carries its own accessible name); the
 * bubble is supplementary (`role="tooltip"`).
 */
export function Tooltip({
  label,
  children,
  side = "top",
  delay = 250,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: Side;
  delay?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      <AnimatePresence>
        {open ? (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1, transition: spring.snappy }}
            exit={{ opacity: 0, scale: 0.96, transition: spring.smooth }}
            className={cn(
              "glass-regular pointer-events-none absolute z-50 whitespace-nowrap rounded-md px-2 py-1 text-footnote text-label shadow-e2",
              sidePosition[side],
              className,
            )}
          >
            {label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
