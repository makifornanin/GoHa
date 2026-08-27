"use client";

import { motion } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight, Repeat, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { LifeArea, Task } from "@/db";
import { addMonths, buildMonthGrid, monthLabel, weekdayHeaders } from "@/lib/calendar";
import { formatIsoDateMedium, startOfMonth, type Weekday } from "@/lib/date";
import { formatDurationHm } from "@/lib/focus";
import { isCompleteOutcome, type HabitOutcome } from "@/lib/habit-outcome";
import { lifeAreaColorConfig, resolveColorKey } from "@/lib/life-areas";
import { spring } from "@/lib/motion";
import { taskEffectiveDate } from "@/lib/task-buckets";
import { cn } from "@/lib/utils";

/**
 * One habit occurrence on a day, precomputed on the server.
 *
 * Carries the resolved OUTCOME rather than a `done` boolean (audit R-06). A
 * boolean could not tell a completion from a numeric habit logged below its
 * target, so both rendered identically and both counted toward "3 of 3 done".
 */
export type HabitDay = {
  date: string;
  habitId: string;
  name: string;
  outcome: HabitOutcome;
  color: string | null;
};

/**
 * How each outcome reads in the day detail list.
 *
 * `partial` is deliberately distinguishable from `done` by more than opacity:
 * it keeps full-strength text and gains an explicit suffix, because the whole
 * point of the finding is that a shortfall was being presented as a success.
 */
const habitOutcomeDisplay: Record<
  HabitOutcome,
  { icon: string; text: string; strike: boolean; suffix: string | null }
> = {
  done: { icon: "text-green", text: "text-label-tertiary", strike: true, suffix: null },
  partial: { icon: "text-orange", text: "text-label", strike: false, suffix: "partial" },
  missed: { icon: "text-red", text: "text-label-secondary", strike: false, suffix: "missed" },
  skipped: { icon: "text-label-tertiary", text: "text-label-tertiary", strike: false, suffix: "skipped" },
  pending: { icon: "text-label-tertiary", text: "text-label", strike: false, suffix: null },
  off_schedule: { icon: "text-label-quaternary", text: "text-label-tertiary", strike: false, suffix: null },
};
/** Focus minutes rolled up per day. */
export type FocusDay = { date: string; seconds: number; sessions: number };

export type CalendarData = {
  tasks: Task[];
  habitDays: HabitDay[];
  focusDays: FocusDay[];
  lifeAreas: LifeArea[];
  today: string;
  weekStartsOn: Weekday;
  /** The month being rendered ("YYYY-MM-01"), resolved on the server. */
  anchor: string;
  /** First and last day the grid draws; also the exact range that was fetched. */
  gridStart: string;
  gridEnd: string;
  /** The user's saved timezone. Required: dates here must not assume Manila. */
  timeZone: string;
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
  const router = useRouter();
  /*
   * The month is a URL parameter, not local state (audit R-07). Local state
   * could navigate past the data the server had fetched; deriving it from the
   * prop means the grid and the query can never disagree about which month is
   * on screen. `layer` and `selected` stay local: they are view preferences,
   * and putting them in the URL would make every filter click a navigation.
   */
  const anchor = data.anchor;
  const [layer, setLayer] = useState<Layer>("all");
  const [selected, setSelected] = useState<string | null>(data.today);

  /** Navigate to another month, keeping the layer choice. */
  function goToMonth(target: string) {
    router.push(`/calendar?month=${target.slice(0, 7)}`);
  }

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
      // The saved timezone, not the Manila default this used to fall back to
      // (audit R-07/R-15). A due-at instant near midnight landed on the wrong
      // calendar day for any user not in Manila.
      const date = taskEffectiveDate(task, data.timeZone);
      if (!date) continue;
      const bucket = map.get(date) ?? [];
      bucket.push(task);
      map.set(date, bucket);
    }
    return map;
  }, [data.tasks, data.timeZone]);

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

  /*
   * The detail panel must obey the layer filter and the fetched window.
   *
   * It previously read straight from the maps, so switching to "Focus" left the
   * selected day still listing tasks and habits the grid had just hidden. And a
   * day selected before navigating stayed in the panel while its data belonged
   * to a month no longer fetched, which is how the truncation in R-07 surfaced
   * as stale detail rather than as an obviously empty screen.
   */
  const selectedInView =
    selected !== null && selected >= data.gridStart && selected <= data.gridEnd ? selected : null;

  const selectedTasks =
    selectedInView && showTasks ? tasksByDate.get(selectedInView) ?? [] : [];
  const selectedHabits =
    selectedInView && showHabits ? habitsByDate.get(selectedInView) ?? [] : [];
  const selectedFocus =
    selectedInView && showFocus ? focusByDate.get(selectedInView) : undefined;

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
            onClick={() => goToMonth(addMonths(anchor, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              // Today means today, not "the month containing today". Leaving the
              // old selection behind sent you to this month with a day from
              // another one still open in the panel.
              setSelected(data.today);
              goToMonth(startOfMonth(data.today));
            }}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => goToMonth(addMonths(anchor, 1))}
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
              // Only a met target counts. A numeric habit logged short of its
              // target is `partial` and must not inflate this (audit R-06).
              const habitsDone = dayHabits.filter((h) => isCompleteOutcome(h.outcome)).length;
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
                        ? "bg-blue-fill font-semibold text-white"
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
                    {selectedHabits.map((habit) => {
                      const display = habitOutcomeDisplay[habit.outcome];
                      return (
                        <li key={habit.habitId} className="flex items-center gap-2">
                          <Repeat className={cn("size-3.5 shrink-0", display.icon)} aria-hidden />
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-body",
                              display.text,
                              display.strike && "line-through",
                            )}
                          >
                            {habit.name}
                          </span>
                          {/* Named, not just tinted: a shortfall that only differs
                              by colour is the same failure as calling it done. */}
                          {display.suffix ? (
                            <span className="shrink-0 text-footnote text-label-tertiary">
                              {display.suffix}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
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
