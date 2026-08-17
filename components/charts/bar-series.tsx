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
    // Hidden from assistive technology on purpose (audit R-18): bar heights
    // carry the meaning and the axis is bare day numbers, so read aloud this is
    // a list of numbers with no subject. Every caller pairs it with a
    // ChartDataTable holding the same series, which is the real equivalent.
    <div className={cn("flex items-end gap-1.5", className)} aria-hidden>
      {points.map((point, index) => {
        const heightPercent = (point.value / max) * 100;
        return (
          <div key={point.label + index} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            {/* The track. Without it, a range where only one week has data drew
                one bar against blank space and read as a stray rectangle rather
                than a chart with eleven empty slots. */}
            <div
              className="flex h-24 w-full items-end justify-center rounded-sm bg-fill-quaternary"
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
        // Each column gets a faint full-height track, so the sparkline reads as
        // a week-by-week shape even when only the last week has anything in it.
        <div
          key={index}
          className="flex h-full min-w-0 flex-1 items-end rounded-[1px] bg-fill-quaternary"
        >
          <div
            className={cn("w-full rounded-[1px]", value === 0 ? "bg-fill-tertiary" : barClassName)}
            style={{ height: value === 0 ? 2 : `${Math.max((value / max) * 100, 12)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
