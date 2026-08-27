"use client";

import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import type { Task } from "@/db";
import { addMonths, buildMonthGrid, groupByDate, monthLabel, weekdayHeaders } from "@/lib/calendar";
import { MANILA_TZ, startOfMonth, type Weekday } from "@/lib/date";
import { spring } from "@/lib/motion";
import { isTaskLate, taskEffectiveDate } from "@/lib/task-buckets";
import { taskPriorityConfig } from "@/lib/tasks";
import { cn } from "@/lib/utils";

const MAX_CHIPS = 3;

/**
 * Month calendar for tasks. Each task sits on its effective date (scheduled, or
 * the local date of its deadline). Clicking a task opens it; clicking empty
 * space in a day starts a new task already scheduled for that day, so the
 * calendar is a planning surface rather than a read-only report.
 */
export function TaskCalendar({
  tasks,
  today,
  weekStartsOn = 1,
  timeZone = MANILA_TZ,
  onOpenTask,
  onCreateOn,
}: {
  tasks: Task[];
  today: string;
  weekStartsOn?: Weekday;
  timeZone?: string;
  onOpenTask: (task: Task) => void;
  onCreateOn: (date: string) => void;
}) {
  const [anchor, setAnchor] = useState(() => startOfMonth(today));
  const [expanded, setExpanded] = useState<string | null>(null);

  const weeks = useMemo(
    () => buildMonthGrid(anchor, today, weekStartsOn),
    [anchor, today, weekStartsOn],
  );
  const byDate = useMemo(
    () => groupByDate(tasks, (t) => taskEffectiveDate(t, timeZone)),
    [tasks, timeZone],
  );
  const headers = useMemo(() => weekdayHeaders(weekStartsOn), [weekStartsOn]);

  const undated = useMemo(
    () => tasks.filter((t) => taskEffectiveDate(t, timeZone) === null),
    [tasks, timeZone],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Month controls */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-title-3 text-label">{monthLabel(anchor)}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setAnchor((a) => addMonths(a, -1))}
            className="hit-44 hit-44-narrow flex size-8 cursor-pointer items-center justify-center rounded-lg text-label-secondary transition-colors hover:bg-surface-hover hover:text-label"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(startOfMonth(today))}
            className="h-8 cursor-pointer rounded-lg px-3 text-callout font-medium text-blue transition-colors hover:bg-blue/12"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setAnchor((a) => addMonths(a, 1))}
            className="hit-44 hit-44-narrow flex size-8 cursor-pointer items-center justify-center rounded-lg text-label-secondary transition-colors hover:bg-surface-hover hover:text-label"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-2xl border border-separator-opaque bg-surface shadow-e1">
        <div className="grid grid-cols-7 border-b border-separator">
          {headers.map((h) => (
            <div key={h} className="px-2 py-2 text-center text-caption uppercase text-label-secondary">
              {h}
            </div>
          ))}
        </div>

        <motion.div
          key={anchor}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.smooth}
          className="grid grid-cols-7"
        >
          {weeks.flat().map((cell) => {
            const dayTasks = byDate.get(cell.date) ?? [];
            const isExpanded = expanded === cell.date;
            const shown = isExpanded ? dayTasks : dayTasks.slice(0, MAX_CHIPS);
            const hidden = dayTasks.length - shown.length;

            return (
              <div
                key={cell.date}
                className={cn(
                  "group/day relative min-h-24 border-b border-r border-separator p-1.5 [&:nth-child(7n)]:border-r-0",
                  !cell.inMonth && "bg-surface-secondary/40",
                )}
              >
                {/*
                  The whole empty area of the day is the "add here" target.

                  It used to be a 20px `+` that only appeared on hover, so on a
                  phone it was invisible and unreachable, and on a desktop it
                  asked for a precise click on the smallest thing in the cell.
                  One button stretched over the cell means tapping the day you
                  are already looking at plans into it.

                  It sits BEHIND the task chips (`z-0` here, `z-10` there), so a
                  click on a task still edits that task rather than creating a
                  second one.
                */}
                <button
                  type="button"
                  aria-label={`Add a task on ${cell.date}`}
                  onClick={() => onCreateOn(cell.date)}
                  className="absolute inset-0 z-0 cursor-pointer rounded-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[-2px] focus-visible:outline-blue/50"
                />

                <div className="pointer-events-none relative z-10 mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full font-mono text-footnote tabular-nums",
                      cell.isToday
                        ? "bg-blue font-semibold text-white"
                        : cell.inMonth
                          ? "text-label-secondary"
                          : "text-label-quaternary",
                    )}
                  >
                    {cell.day}
                  </span>
                  {/* Decoration, not a control: the cell button behind it is what
                      actually adds, so this is one tab stop per day rather than
                      two. Shown on hover and whenever the cell has focus. */}
                  <span
                    aria-hidden
                    className="flex size-5 items-center justify-center rounded-md text-label-tertiary opacity-0 transition-opacity group-hover/day:opacity-100 group-focus-within/day:opacity-100"
                  >
                    <Plus className="size-3.5" />
                  </span>
                </div>

                <div className="relative z-10 flex flex-col gap-1">
                  {shown.map((task) => {
                    const done = task.status === "completed";
                    const late = isTaskLate(task, new Date(), timeZone);
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onOpenTask(task)}
                        title={task.title}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-footnote transition-colors",
                          done
                            ? "text-label-tertiary line-through hover:bg-surface-hover"
                            : late
                              ? "bg-red/12 text-red hover:bg-red/20"
                              : "bg-surface-secondary text-label hover:bg-surface-pressed",
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            done ? "bg-gray-3" : taskPriorityConfig[task.priority].accent,
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      </button>
                    );
                  })}

                  {hidden > 0 ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(cell.date)}
                      className="cursor-pointer px-1.5 text-left text-footnote font-medium text-blue hover:underline"
                    >
                      +{hidden} more
                    </button>
                  ) : null}
                  {isExpanded && dayTasks.length > MAX_CHIPS ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(null)}
                      className="cursor-pointer px-1.5 text-left text-footnote font-medium text-label-secondary hover:underline"
                    >
                      Show less
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>

      {/* Undated work would otherwise be invisible on a calendar. */}
      {undated.length > 0 ? (
        <div className="rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1">
          <h4 className="mb-2 text-caption uppercase text-label-secondary">
            No date ({undated.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpenTask(task)}
                className="cursor-pointer rounded-md bg-surface-secondary px-2 py-1 text-footnote text-label transition-colors hover:bg-surface-pressed"
              >
                {task.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
