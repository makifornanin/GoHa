"use client";

import { formatIsoDateMedium, startOfWeek, weekdayOf, type Weekday } from "@/lib/date";
import type { HeatCell } from "@/lib/progress";
import { cn } from "@/lib/utils";

/**
 * A GitHub-style habit heatmap: weeks as columns, weekdays as rows.
 *
 * The intensity ramp is green-on-fill rather than the app's blue so it reads as
 * "history" and never competes with blue, which everywhere else in GoHa means
 * "an action you can take right now".
 */
const LEVEL_CLASS: Record<HeatCell["level"], string> = {
  0: "bg-fill-tertiary",
  1: "bg-green/25",
  2: "bg-green/45",
  3: "bg-green/70",
  4: "bg-green",
};

const WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"];

export function HabitHeatmap({
  cells,
  today,
  weekStartsOn = 1,
  className,
}: {
  cells: HeatCell[];
  today: string;
  weekStartsOn?: Weekday;
  className?: string;
}) {
  if (cells.length === 0) return null;

  // Bucket into week columns so the grid is stable even when the range does not
  // begin on the user's week start.
  const byWeek = new Map<string, Map<number, HeatCell>>();
  for (const cell of cells) {
    const week = startOfWeek(cell.date, weekStartsOn);
    const column = byWeek.get(week) ?? new Map<number, HeatCell>();
    column.set(weekdayOf(cell.date), cell);
    byWeek.set(week, column);
  }
  const weeks = [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

  // Row order follows the user's week-start preference.
  const rows: Weekday[] = Array.from(
    { length: 7 },
    (_, i) => (((weekStartsOn + i) % 7) as Weekday),
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="overflow-x-auto">
        <div className="flex gap-1">
          {/* Weekday gutter: label alternating rows only, so it stays readable. */}
          <div className="mr-1 flex shrink-0 flex-col gap-1">
            {rows.map((weekday, index) => (
              <span
                key={weekday}
                className="flex h-3.5 items-center text-footnote leading-none text-label-tertiary"
                aria-hidden
              >
                {index % 2 === 1 ? WEEKDAY_INITIAL[weekday] : ""}
              </span>
            ))}
          </div>

          {weeks.map(([week, column]) => (
            <div key={week} className="flex shrink-0 flex-col gap-1">
              {rows.map((weekday) => {
                const cell = column.get(weekday);
                if (!cell) {
                  return <span key={weekday} className="size-3.5 rounded-[3px]" aria-hidden />;
                }
                const label =
                  cell.scheduled === 0
                    ? `${formatIsoDateMedium(cell.date)}: nothing scheduled`
                    : `${formatIsoDateMedium(cell.date)}: ${cell.done} of ${cell.scheduled} habits`;
                return (
                  <span
                    key={weekday}
                    title={label}
                    aria-label={label}
                    className={cn(
                      "size-3.5 rounded-[3px]",
                      LEVEL_CLASS[cell.level],
                      cell.date === today && "ring-2 ring-blue/60 ring-offset-1 ring-offset-surface",
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 text-footnote text-label-tertiary">
        <span>Less</span>
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <span key={level} className={cn("size-3.5 rounded-[3px]", LEVEL_CLASS[level])} aria-hidden />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
