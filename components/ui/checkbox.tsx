"use client";

import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react";
import { Check } from "lucide-react";

import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Circular checkbox per spec section 8 (Apple uses circles in Reminders; a
 * square would break the signature). 20x20, 1.5px gray-3 border; checked fills
 * with the Life Area system color (blue fallback), white check at stroke 2.
 * Completion plays the bouncy scale (1 -> 1.2 -> 1). The visual control is
 * 20px; the hit area is 44px (HIG minimum).
 */
export function Checkbox({
  checked,
  onToggle,
  color,
  className,
  disabled,
  ...props
}: Omit<HTMLMotionProps<"button">, "onClick" | "color" | "checked"> & {
  checked: boolean;
  onToggle: () => void;
  /** CSS color for the checked fill, e.g. `var(--blue)`. Defaults to blue. */
  color?: string;
}) {
  const fill = color ?? "var(--blue)";

  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      whileTap={{ scale: 0.9 }}
      transition={spring.snappy}
      className={cn(
        "hit-44 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-transparent" : "border-gray-3 hover:border-gray-1",
        className,
      )}
      style={checked ? { backgroundColor: fill } : undefined}
      {...props}
    >
      {/* The satisfying pop comes from the bouncy spring overshooting on the way
          to scale 1. Springs support only TWO keyframes, so a [1, 1.2, 1]
          sequence throws "Only two keyframes currently supported" at runtime. */}
      <AnimatePresence initial={false}>
        {checked ? (
          <motion.span
            key="check"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={spring.bouncy}
            className="flex items-center justify-center text-white"
          >
            {/* stroke-2 (utilities layer) beats the base `svg.lucide` 1.5 rule,
                which otherwise overrides the strokeWidth attribute. */}
            <Check className="size-3 stroke-2" aria-hidden />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.button>
  );
}
