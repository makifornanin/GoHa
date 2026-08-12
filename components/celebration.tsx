"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Flame, Target, Trophy } from "lucide-react";
import { useEffect } from "react";

import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The moment something actually lands.
 *
 * Completing work was the emotional peak of the product and it was a
 * strikethrough and a grey toast. This is the counterweight: rare, short, and
 * never in the way. It fires ONLY for the three things worth marking (a goal
 * reaching 100%, a 7-day streak, a 30-day streak), auto-dismisses, and is
 * pointer-transparent so it can never block a click.
 *
 * Everyday task completion deliberately does NOT come through here. A toast
 * every few minutes stops being a reward and becomes noise; the checkbox's own
 * bouncy fill already carries that beat.
 */
export type Milestone =
  | { kind: "goal"; title: string }
  | { kind: "streak"; habit: string; days: number };

const CONFIG = {
  goal: {
    icon: Trophy,
    tint: "text-green",
    ring: "bg-green/12",
    eyebrow: "Goal complete",
  },
  streak: {
    icon: Flame,
    tint: "text-orange",
    ring: "bg-orange/12",
    eyebrow: "Streak milestone",
  },
} as const;

/** Twelve particles on a fixed ring: enough to read as celebration, not confetti spam. */
const PARTICLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  return { x: Math.cos(angle) * 78, y: Math.sin(angle) * 78, delay: (i % 4) * 0.03 };
});

export function Celebration({
  milestone,
  onDone,
}: {
  milestone: Milestone | null;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!milestone) return;
    const id = setTimeout(onDone, 2600);
    return () => clearTimeout(id);
  }, [milestone, onDone]);

  const config = milestone ? CONFIG[milestone.kind] : null;
  const Icon = milestone?.kind === "goal" ? Trophy : milestone ? Flame : Target;

  return (
    <AnimatePresence>
      {milestone && config ? (
        <motion.div
          // Pointer-transparent: a celebration must never swallow the click the
          // user is already making somewhere else on the page.
          className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={spring.smooth}
          role="status"
          aria-live="polite"
        >
          <motion.div
            className="glass-thick flex max-w-[min(22rem,calc(100vw-2rem))] flex-col items-center rounded-3xl px-7 py-6 text-center shadow-e3"
            initial={{ scale: reduceMotion ? 1 : 0.9, y: reduceMotion ? 0 : 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: reduceMotion ? 1 : 0.96, opacity: 0 }}
            transition={spring.bouncy}
          >
            <div className="relative flex size-16 items-center justify-center">
              <span className={cn("absolute inset-0 rounded-full", config.ring)} aria-hidden />
              {!reduceMotion
                ? PARTICLES.map((p, i) => (
                    <motion.span
                      key={i}
                      aria-hidden
                      className={cn("absolute size-1.5 rounded-full", config.tint, "bg-current")}
                      initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
                      animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: 1 }}
                      transition={{ duration: 0.9, delay: p.delay, ease: "easeOut" }}
                    />
                  ))
                : null}
              <motion.span
                className={cn("relative", config.tint)}
                initial={{ scale: reduceMotion ? 1 : 0 }}
                animate={{ scale: 1 }}
                transition={spring.bouncy}
              >
                <Icon className="size-8" aria-hidden />
              </motion.span>
            </div>

            <p className={cn("mt-4 text-caption uppercase", config.tint)}>{config.eyebrow}</p>
            <p className="mt-1 text-title-3 text-label">
              {milestone.kind === "goal"
                ? milestone.title
                : `${milestone.days} days of ${milestone.habit}`}
            </p>
            <p className="mt-1.5 text-callout text-label-secondary">
              {milestone.kind === "goal"
                ? "Every task under it is done."
                : milestone.days >= 30
                  ? "A month unbroken. This one has stuck."
                  : "A full week. It is becoming a habit."}
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
