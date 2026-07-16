import type { Transition, Variants } from "motion/react";

/**
 * GoHa motion system: Apple springs (docs/GOHA_DESIGN_SPEC.md section 9).
 * Apple does not use cubic-bezier easing; it uses interruptible springs that
 * carry velocity. THE THREE SPRINGS BELOW ARE THE ONLY EASINGS ALLOWED.
 * Reduced motion is honored globally via <MotionConfig reducedMotion="user">
 * (components/motion-config.tsx) plus a CSS fallback in globals.css.
 *
 * Assignments:
 * - Color, opacity, hover ............ spring.smooth
 * - Press, toggle, selection, most UI  spring.snappy
 * - Task completion, celebration ..... spring.bouncy
 * Morph, do not fade: use `layoutId` for the segmented-control pill, modal
 * opens, and the sidebar active indicator.
 */
export const spring = {
  smooth: { type: "spring", duration: 0.3, bounce: 0 },
  snappy: { type: "spring", duration: 0.3, bounce: 0.15 },
  bouncy: { type: "spring", duration: 0.5, bounce: 0.3 },
} as const satisfies Record<string, Transition>;

/** Press choreography: scale(0.96), snappy. */
export const press = {
  whileTap: { scale: 0.96 },
  transition: spring.snappy,
} as const;

/**
 * List entrance: fade plus 4px translateY, 20ms stagger capped at 8 items,
 * smooth. Pass the item index via the `custom` prop.
 */
export const listEntrance: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...spring.smooth, delay: Math.min(index, 8) * 0.02 },
  }),
};

/** Row exit for completed/removed items: fade and collapse height, smooth. */
export const rowExit = {
  opacity: 0,
  height: 0,
  transition: spring.smooth,
} as const;

/* =====================================================================
   Compatibility exports for screens not yet rebuilt to the Apple spec.
   These are re-expressed on the three springs; do not use them in new code.
   ===================================================================== */

/** @deprecated Use spring.snappy. */
export const springSnappy: Transition = spring.snappy;

/** @deprecated Use spring.smooth. */
export const springSmooth: Transition = spring.smooth;

/**
 * @deprecated Legacy bezier kept ONLY so screens awaiting their rollout slice
 * keep compiling. Springs are the rule (spec section 9); do not use.
 */
export const easeOutExpo = [0.2, 0, 0, 1] as const;

/** @deprecated Springs carry their own timing; do not use in new code. */
export const durations = {
  fast: 0.12,
  base: 0.18,
  slow: 0.24,
} as const;

/** @deprecated Legacy stagger container. New code: `listEntrance` + custom. */
export const listContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.02 },
  },
};

/** @deprecated Legacy list item. New code: `listEntrance` + custom. */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: spring.smooth },
  exit: { opacity: 0, transition: spring.smooth },
};

/** Plain fade on the smooth spring (scrims, cross-fades). */
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: spring.smooth },
  exit: { opacity: 0, transition: spring.smooth },
};

/** Pop-in for menus and popovers: scale from 0.96, snappy. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.96, transition: spring.smooth },
};

/** @deprecated Use `press`. */
export const pressable = {
  whileTap: { scale: 0.96 },
  transition: spring.snappy,
} as const;

/** @deprecated Use `press`. */
export const pressableSubtle = {
  whileTap: { scale: 0.96 },
  transition: spring.snappy,
} as const;
