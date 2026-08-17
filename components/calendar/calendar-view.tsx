"use client";

import { motion } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight, Repeat, Timer } from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { LifeArea, Task } from "@/db";
import { addMonths, buildMonthGrid, monthLabel, weekdayHeaders } from "@/lib/calendar";
import { formatIsoDateMedium, startOfMonth, type Weekday } from "@/lib/date";
import { formatDurationHm } from "@/lib/focus";
import { lifeAreaColorConfig, resolveColorKey } from "@/lib/life-areas";
import { spring } from "@/lib/motion";
import { taskEffectiveDate } from "@/lib/task-buckets";
import { cn } from "@/lib/utils";

/** One habit occurrence on a day, precomputed on the server. */
export type HabitDay = { date: string; habitId: string; name: string; done: boolean; color: string | null };
/** Focus minutes rolled up per day. */
export type FocusDay = { date: string; seconds: number; sessions: number };

export type CalendarData = {
  tasks: Task[];
  habitDays: HabitDay[];
  focusDays: FocusDay[];
  lifeAreas: LifeArea[];
  today: string;
  weekStartsOn: Weekday;
};

type Layer = "all" | "tasks" | "habits" | "focus";

/**
 * The unified schedule: everything that lands on a day, on one surface.
 *
 * Distinct from the calendar inside To-dos, which shows tasks alone so it can
 * stay a working editor. This one answers "what does my week actually look
 * like", which needs habits and focus time in the picture too, so it is
 * read-and-navigate rather than an editing surface.
 */
export function CalendarView({ data }: { data: CalendarData }) {
  const [anchor, setAnchor] = useState(() => startOfMonth(data.today));
  const [layer, setLayer] = useState<Layer>("all");
  const [selected, setSelected] = useState<string | null>(data.today);

  const weeks = useMemo(
    () => buildMonthGrid(anchor, data.today, data.weekStartsOn),
    [anchor, data.today, data.weekStartsOn],
  );
  const headers = useMemo(() => weekdayHeaders(data.weekStartsOn), [data.weekStartsOn]);
  const areaById = useMemo(
    () => new Map(data.lifeAreas.map((a) => [a.id, a])),
    [data.lifeAreas],
  );

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of data.tasks) {
      const date = taskEffectiveDate(task);
      if (!date) continue;
      const bucket = map.get(date) ?? [];
      bucket.push(task);
      map.set(date, bucket);
    }
    return map;
  }, [data.tasks]);

  const habitsByDate = useMemo(() => {
    const map = new Map<string, HabitDay[]>();
    for (const h of data.habitDays) {
      const bucket = map.get(h.date) ?? [];
      bucket.push(h);
      map.set(h.date, bucket);
    }
    return map;
  }, [data.habitDays]);

  const focusByDate = useMemo(
    () => new Map(data.focusDays.map((f) => [f.date, f])),
    [data.focusDays],
  );

  const showTasks = layer === "all" || layer === "tasks";
  const showHabits = layer === "all" || layer === "habits";
  const showFocus = layer === "all" || layer === "focus";

  const selectedTasks = selected ? tasksByDate.get(selected) ?? [] : [];
  const selectedHabits = selected ? habitsByDate.get(selected) ?? [] : [];
  const selectedFocus = selected ? focusByDate.get(selected) : undefined;

  function dotColor(task: Task): string {
    const area = task.lifeAreaId ? areaById.get(task.lifeAreaId) : null;
    return area ? lifeAreaColorConfig[resolveColorKey(area.color, area.id)].dot : "bg-blue";
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Everything that lands on a day: scheduled work, habits, and focus time."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => setAnchor((a) => addMonths(a, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button variant="secondary" onClick={() => setAnchor(startOfMonth(data.today))}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => setAnchor((a) => addMonths(a, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <span className="text-title-3 text-label">{monthLabel(anchor)}</span>

        <SegmentedControl
          className="ml-auto"
          value={layer}
          onChange={(v) => setLayer(v as Layer)}
          ariaLabel="Show layer"
          options={[
            { value: "all", label: "All" },
            { value: "tasks", label: "Tasks" },
            { value: "habits", label: "Habits" },
            { value: "focus", label: "Focus" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="overflow-hidden xl:col-span-8">
          <div className="grid grid-cols-7 border-b border-separator">
            {headers.map((h) => (
              <div
                key={h}
                className="py-2 text-center text-caption uppercase text-label-secondary"
              >
                {h}
              </div>
            ))}
          </div>

          <motion.div
            key={anchor}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={spring.smooth}
            className="grid grid-cols-7"
          >
            {weeks.flat().map((cell) => {
              const dayTasks = showTasks ? tasksByDate.get(cell.date) ?? [] : [];
              const dayHabits = showHabits ? habitsByDate.get(cell.date) ?? [] : [];
              const dayFocus = showFocus ? focusByDate.get(cell.date) : undefined;
              const habitsDone = dayHabits.filter((h) => h.done).length;
              const isSelected = selected === cell.date;
              // A day that has not happened cannot have missed anything. Showing
              // "0/3" on every future date painted the rest of the month as
              // failure; a future day states what is scheduled instead.
              const isFuture = cell.date > data.today;

              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => setSelected(cell.date)}
                  aria-label={`${formatIsoDateMedium(cell.date)}: ${dayTasks.length} tasks, ${
                    isFuture
                      ? `${dayHabits.length} habits scheduled`
                      : `${habitsDone} of ${dayHabits.length} habits done`
                  }`}
                  aria-pressed={isSelected}
                  className={cn(
                    "min-h-24 cursor-pointer border-b border-r border-separator p-1.5 text-left transition-colors [&:nth-child(7n)]:border-r-0 hover:bg-surface-hover",
                    !cell.inMonth && "bg-fill-quaternary",
                    isSelected && "bg-blue/8 ring-1 ring-inset ring-blue/40",
                  )}
                >
                  <span
                    className={cn(
                      "mb-1 flex size-6 items-center justify-center rounded-full font-mono text-footnote tabular-nums",
                      cell.isToday
                        ? "bg-blue font-semibold text-white"
                        : cell.inMonth
                          ? "text-label-secondary"
                          : "text-label-quaternary",
                    )}
                  >
                    {cell.day}
                  </span>

                  <span className="flex flex-col gap-0.5">
                    {dayTasks.slice(0, 2).map((task) => (
                      <span
                        key={task.id}
                        className="flex items-center gap-1 truncate text-footnote text-label"
                      >
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            task.status === "completed" ? "bg-gray-3" : dotColor(task),
                          )}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            "truncate",
                            task.status === "completed" && "text-label-tertiary line-through",
                          )}
                        >
                          {task.title}
                        </span>
                      </span>
                    ))}
                    {dayTasks.length > 2 ? (
                      <span className="text-footnote text-label-tertiary">
                        +{dayTasks.length - 2} more
                      </span>
                    ) : null}

                    {/* Habits and focus read as day-level texture, not rows. */}
                    <span className="mt-0.5 flex items-center gap-1.5">
                      {dayHabits.length > 0 ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded-sm px-1 font-mono text-footnote tabular-nums",
                            !isFuture && habitsDone === dayHabits.length
                              ? "bg-green/15 text-green"
                              : "bg-fill-tertiary text-label-secondary",
                          )}
                          title={
                            isFuture
                              ? `${dayHabits.length} habits scheduled`
                              : `${habitsDone} of ${dayHabits.length} habits done`
                          }
                        >
                          <Repeat className="size-2.5" aria-hidden />
                          {isFuture ? dayHabits.length : `${habitsDone}/${dayHabits.length}`}
                        </span>
                      ) : null}
                      {dayFocus && dayFocus.seconds > 0 ? (
                        <span className="inline-flex items-center gap-0.5 rounded-sm bg-indigo/12 px-1 font-mono text-footnote tabular-nums text-indigo">
                          <Timer className="size-2.5" aria-hidden />
                          {Math.round(dayFocus.seconds / 60)}m
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </motion.div>
        </Card>

        {/* The selected day, in full. */}
        <div className="xl:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-4 text-label-secondary" aria-hidden />
                {selected ? formatIsoDateMedium(selected) : "Pick a day"}
              </CardTitle>
              {selected === data.today ? (
                <span className="rounded-full bg-blue/12 px-2 py-0.5 text-footnote text-blue">
                  Today
                </span>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {selectedTasks.length === 0 && selectedHabits.length === 0 && !selectedFocus ? (
                <p className="rounded-xl bg-fill-quaternary px-4 py-6 text-center text-callout text-label-secondary">
                  Nothing on this day.
                </p>
              ) : null}

              {selectedTasks.length > 0 ? (
                <section>
                  <h4 className="mb-2 text-caption uppercase text-label-secondary">Tasks</h4>
                  <ul className="flex flex-col gap-1.5">
                    {selectedTasks.map((task) => (
                      <li key={task.id} className="flex items-center gap-2">
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            task.status === "completed" ? "bg-gray-3" : dotColor(task),
                          )}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-body",
                            task.status === "completed"
                              ? "text-label-tertiary line-through"
                              : "text-label",
                          )}
                        >
                          {task.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {selectedHabits.length > 0 ? (
                <section>
                  <h4 className="mb-2 text-caption uppercase text-label-secondary">Habits</h4>
                  <ul className="flex flex-col gap-1.5">
                    {selectedHabits.map((habit) => (
                      <li key={habit.habitId} className="flex items-center gap-2">
                        <Repeat
                          className={cn(
                            "size-3.5 shrink-0",
                            habit.done ? "text-green" : "text-label-tertiary",
                          )}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-body",
                            habit.done ? "text-label-tertiary line-through" : "text-label",
                          )}
                        >
                          {habit.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {selectedFocus && selectedFocus.seconds > 0 ? (
                <section className="flex items-center justify-between gap-3 border-t border-separator pt-3">
                  <span className="flex items-center gap-2 text-callout text-label-secondary">
                    <Timer className="size-4 text-indigo" aria-hidden />
                    Focus
                  </span>
                  <span className="text-right">
                    <span className="font-mono text-body tabular-nums text-label">
                      {formatDurationHm(selectedFocus.seconds)}
                    </span>
                    <span className="block text-footnote text-label-tertiary">
                      {selectedFocus.sessions} session{selectedFocus.sessions === 1 ? "" : "s"}
                    </span>
                  </span>
                </section>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
