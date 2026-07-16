import { Flame, Pencil } from "lucide-react";

import { formatIsoDateMedium } from "@/lib/date";
import { dayCellConfig, WEEKDAY_ABBR } from "@/lib/habits";
import type { HabitView } from "@/lib/habit-view";
import { lifeAreaColorConfig, toColorKey } from "@/lib/life-areas";
import { cn } from "@/lib/utils";

/** Read-only weekly history: habits as rows, the current week's days as columns. */
export function HabitsWeekGrid({
  views,
  onEdit,
}: {
  views: HabitView[];
  onEdit: (habitId: string) => void;
}) {
  if (views.length === 0) return null;
  const headerCells = views[0].weekCells;

  return (
    <section className="raised card-shadow rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-headline-md text-on-surface">This Week</h3>
          <p className="tabular mt-0.5 font-mono text-mono-sm text-on-surface-variant">
            {formatIsoDateMedium(headerCells[0].date)} – {formatIsoDateMedium(headerCells[6].date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-label-sm text-on-surface-variant">
          {(["done", "partial", "miss", "skip"] as const).map((state) => (
            <span key={state} className="flex items-center gap-1.5">
              <span className={cn("size-3 rounded-sm", dayCellConfig[state].className)} />
              {dayCellConfig[state].label}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/40">
              <th className="w-1/3 py-2 pr-2 text-left text-label-sm font-normal uppercase tracking-wider text-on-surface-variant">
                Habit
              </th>
              <th className="w-16 py-2 text-center text-label-sm font-normal text-on-surface-variant">
                Streak
              </th>
              {headerCells.map((cell) => (
                <th
                  key={cell.date}
                  className="w-9 py-2 text-center text-label-sm font-normal text-on-surface-variant"
                >
                  {WEEKDAY_ABBR[cell.weekday][0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {views.map(({ habit, streaks, weekCells }) => {
              const color = lifeAreaColorConfig[toColorKey(habit.color)];
              return (
                <tr key={habit.id} className="border-b border-outline-variant/10 last:border-0">
                  <td className="py-3 pr-2">
                    <button
                      type="button"
                      onClick={() => onEdit(habit.id)}
                      className="group flex items-center gap-2 text-left"
                    >
                      <span className={cn("size-2 shrink-0 rounded-full", color.swatch)} aria-hidden />
                      <span className="truncate text-body-md text-on-surface group-hover:text-primary">
                        {habit.name}
                      </span>
                      <Pencil className="size-3.5 shrink-0 text-outline opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </button>
                  </td>
                  <td className="py-3 text-center">
                    <span className="tabular inline-flex items-center gap-1 font-mono text-mono-sm text-on-surface-variant">
                      <Flame className={cn("size-3.5", streaks.current > 0 ? "text-secondary" : "text-outline")} aria-hidden />
                      {streaks.current}
                    </span>
                  </td>
                  {weekCells.map((cell) => (
                    <td key={cell.date} className="py-3 text-center">
                      <span
                        className={cn("mx-auto block size-5 rounded-md", dayCellConfig[cell.state].className)}
                        title={`${formatIsoDateMedium(cell.date)}: ${dayCellConfig[cell.state].label}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
