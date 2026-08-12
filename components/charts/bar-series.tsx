"use client";

import { motion } from "motion/react";

import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type SeriesPoint = { label: string; value: number; caption?: string; emphasis?: boolean };

/**
 * A bar series drawn with plain divs, not an SVG or a charting library.
 *
 * At this size a chart is a row of rectangles; a dependency would add bundle
 * weight and its own colour system for something Tailwind already does. Bars
 * carry the design tokens directly, so they follow light/dark with everything
 * else and need no theme bridge.
 */
export function BarSeries({
  points,
  unit = "",
  className,
  barClassName = "bg-blue",
  emphasisClassName = "bg-blue",
}: {
  points: SeriesPoint[];
  unit?: string;
  className?: string;
  barClassName?: string;
  emphasisClassName?: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));

  return (
    <div className={cn("flex items-end gap-1.5", className)}>
      {points.map((point, index) => {
        const heightPercent = (point.value / max) * 100;
        return (
          <div key={point.label + index} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div
              className="flex h-24 w-full items-end justify-center"
              title={`${point.label}: ${point.value}${unit}`}
            >
              <motion.div
                // A zero day still gets a visible sliver: a flat gap reads as
                // "no data", which is a different claim from "nothing done".
                className={cn(
                  "w-full rounded-t-sm",
                  point.value === 0
                    ? "bg-fill-tertiary"
                    : point.emphasis
                      ? emphasisClassName
                      : barClassName,
                )}
                initial={{ height: 0 }}
                animate={{ height: point.value === 0 ? 3 : `${Math.max(heightPercent, 6)}%` }}
                transition={{ ...spring.smooth, delay: Math.min(index, 12) * 0.02 }}
              />
            </div>
            <span
              className={cn(
                "w-full truncate text-center text-footnote tabular-nums",
                point.emphasis ? "font-medium text-label" : "text-label-tertiary",
              )}
            >
              {point.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A compact inline sparkline for a single trend, sized to sit in a card row.
 * Same reasoning as above: divs, tokens, no library.
 */
export function Sparkline({
  values,
  className,
  barClassName = "bg-blue",
}: {
  values: number[];
  className?: string;
  barClassName?: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <div className={cn("flex h-8 items-end gap-0.5", className)} aria-hidden>
      {values.map((value, index) => (
        <div
          key={index}
          className={cn(
            "min-w-0 flex-1 rounded-[1px]",
            value === 0 ? "bg-fill-tertiary" : barClassName,
          )}
          style={{ height: value === 0 ? 2 : `${Math.max((value / max) * 100, 12)}%` }}
        />
      ))}
    </div>
  );
}
