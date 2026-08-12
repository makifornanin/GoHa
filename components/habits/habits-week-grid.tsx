"use client";

import { Archive, Flame, Pencil } from "lucide-react";

import { formatIsoDateMedium } from "@/lib/date";
import { dayCellConfig, WEEKDAY_ABBR } from "@/lib/habits";
import type { HabitView } from "@/lib/habit-view";
import { lifeAreaColorConfig, type LifeAreaColorKey } from "@/lib/life-areas";
import { cn } from "@/lib/utils";

/**
 * The week's history AND the place habits are managed.
 *
 * This screen used to render the same habits three times: today's check-in
 * list, this grid, and an "All habits" card grid underneath that repeated the
 * names and streaks a third time purely to hold Edit/Archive. Those actions live
 * on the row now, so the page says each thing once.
 */
export function HabitsWeekGrid({
  views,
  colorOf,
  onEdit,
  onArchive,
}: {
  views: HabitView[];
  colorOf: (habit: { id: string; color: string | null; lifeAreaId: string | null }) => LifeAreaColorKey;
  onEdit: (habitId: string) => void;
  onArchive: (view: HabitView) => void;
}) {
  if (views.length === 0) return null;
  const headerCells = views[0].weekCells;

  return (
    <section className="rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-headline text-label">This Week</h3>
          <p className="mt-0.5 font-mono text-footnote tabular-nums text-label-secondary">
            {formatIsoDateMedium(headerCells[0].date)} – {formatIsoDateMedium(headerCells[6].date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-footnote text-label-secondary">
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
            <tr className="border-b border-separator">
              <th className="py-2 pr-2 text-left text-caption font-semibold uppercase text-label-secondary">
                Habit
              </th>
              <th className="w-20 py-2 text-center text-caption font-semibold uppercase text-label-secondary">
                Streak
              </th>
              {headerCells.map((cell) => (
                <th
                  key={cell.date}
                  className={cn(
                    "w-9 py-2 text-center text-caption font-semibold uppercase",
                    cell.isToday ? "text-blue" : "text-label-secondary",
                  )}
                >
                  {WEEKDAY_ABBR[cell.weekday][0]}
                </th>
              ))}
              <th className="w-20">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {views.map((view) => {
              const { habit, streaks, weekCells } = view;
              const color = lifeAreaColorConfig[colorOf(habit)];
              return (
                <tr key={habit.id} className="group border-b border-separator last:border-0">
                  <td className="py-3 pr-2">
                    <button
                      type="button"
                      onClick={() => onEdit(habit.id)}
                      // `hit-44` is safe here: the name is the only control in
                      // its cell, so a taller hit area has no neighbour to
                      // steal taps from (unlike the colour swatch rows).
                      className="hit-44 flex max-w-full cursor-pointer items-center gap-2 text-left"
                    >
                      <span className={cn("size-2 shrink-0 rounded-full", color.dot)} aria-hidden />
                      <span className="truncate text-body text-label hover:text-blue">
                        {habit.name}
                      </span>
                    </button>
                  </td>
                  <td className="py-3 text-center">
                    <span
                      className="inline-flex items-center gap-1 font-mono text-footnote tabular-nums text-label-secondary"
                      title={`Current ${streaks.current}, best ${streaks.longest}`}
                    >
                      <Flame
                        className={cn(
                          "size-3.5",
                          streaks.current > 0 ? "text-orange" : "text-label-tertiary",
                        )}
                        aria-hidden
                      />
                      {streaks.current}
                      <span className="text-label-tertiary">/{streaks.longest}</span>
                    </span>
                  </td>
                  {weekCells.map((cell) => (
                    <td key={cell.date} className="py-3 text-center">
                      <span
                        className={cn(
                          "mx-auto block size-5 rounded-sm",
                          dayCellConfig[cell.state].className,
                          // Today is the only cell still open to act on, so it
                          // must not look identical to an untouched future day.
                          cell.isToday &&
                            cell.state === "pending" &&
                            "border-2 border-solid border-blue/60 bg-blue/10",
                          cell.isToday && cell.state !== "pending" && "ring-2 ring-blue/40 ring-offset-1 ring-offset-surface",
                        )}
                        title={`${formatIsoDateMedium(cell.date)}: ${dayCellConfig[cell.state].label}${
                          cell.isToday ? " (today)" : ""
                        }`}
                      />
                    </td>
                  ))}
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                      <RowAction onClick={() => onEdit(habit.id)} icon={Pencil} label={`Edit ${habit.name}`} />
                      <RowAction
                        onClick={() => onArchive(view)}
                        icon={Archive}
                        label={`Archive ${habit.name}`}
                        className="hover:text-red"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowAction({
  onClick,
  icon: Icon,
  label,
  className,
}: {
  onClick: () => void;
  icon: typeof Pencil;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "hit-44 hit-44-narrow flex size-7 cursor-pointer items-center justify-center rounded-full text-label-tertiary transition-colors hover:bg-surface-hover hover:text-label focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}
