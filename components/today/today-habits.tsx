"use client";

import { motion } from "motion/react";
import { Repeat } from "lucide-react";
import Link from "next/link";
import { useMemo, useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { clearHabitEntryAction, logHabitEntryAction } from "@/app/(app)/habits/actions";
import { HabitLogControl, type LogInput } from "@/components/habits/habit-log-control";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HabitEntry, LifeArea } from "@/db";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import { deriveTodayHabits } from "@/lib/habit-view";
import { entityColorKey, lifeAreaColorConfig } from "@/lib/life-areas";
import { listEntrance } from "@/lib/motion";
import { cn } from "@/lib/utils";

type EntryAction = { type: "upsert"; entry: HabitEntry } | { type: "remove"; habitId: string; date: string };

/**
 * Today's scheduled habits, logged inline. Writes to the SAME habit_entries the
 * Habits module reads (CLAUDE.md section 7): logging here appears there and
 * vice versa. Rows follow the spec task-row metrics; the habit's color comes
 * from the Apple system palette via its stored color key.
 */
export function TodayHabits({
  habits,
  entries,
  lifeAreas,
  today,
  timeZone,
}: {
  habits: HabitWithSchedule[];
  entries: HabitEntry[];
  lifeAreas: LifeArea[];
  today: string;
  timeZone?: string;
}) {
  const [, startTransition] = useTransition();

  const lifeAreaById = useMemo(() => new Map(lifeAreas.map((a) => [a.id, a])), [lifeAreas]);

  const [optimisticEntries, applyEntry] = useOptimistic(entries, (state, action: EntryAction) => {
    if (action.type === "remove") {
      return state.filter((e) => !(e.habitId === action.habitId && e.entryDate === action.date));
    }
    const rest = state.filter(
      (e) => !(e.habitId === action.entry.habitId && e.entryDate === action.entry.entryDate),
    );
    return [...rest, action.entry];
  });

  const todayHabits = useMemo(
    () => deriveTodayHabits(habits, optimisticEntries, today, timeZone),
    [habits, optimisticEntries, today, timeZone],
  );

  function makeEntry(habitId: string, input: LogInput): HabitEntry {
    const now = new Date();
    return {
      id: `optimistic-${habitId}-${today}`,
      userId: "",
      habitId,
      entryDate: today,
      status: input.status,
      value: input.value != null ? String(input.value) : null,
      note: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  function log(habitId: string, input: LogInput) {
    startTransition(async () => {
      applyEntry({ type: "upsert", entry: makeEntry(habitId, input) });
      const result = await logHabitEntryAction(habitId, today, input);
      if (!result.ok) toast.error(result.error);
    });
  }

  function clear(habitId: string) {
    startTransition(async () => {
      applyEntry({ type: "remove", habitId, date: today });
      const result = await clearHabitEntryAction(habitId, today);
      if (!result.ok) toast.error(result.error);
    });
  }

  const doneCount = todayHabits.filter((h) => h.todayState === "done").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="size-4 text-label-secondary" aria-hidden />
          Habits
        </CardTitle>
        {todayHabits.length > 0 ? (
          <span className="font-mono text-footnote tabular-nums text-label-secondary">
            {doneCount}
            <span className="text-label-tertiary">/{todayHabits.length}</span>
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="px-1 pb-2">
        {todayHabits.length === 0 ? (
          <p className="mx-3 mb-2 rounded-xl bg-surface-secondary px-4 py-6 text-center text-callout text-label-secondary">
            No habits scheduled today.{" "}
            <Link href="/habits" className="font-medium text-blue hover:underline">
              Manage habits
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col">
            {todayHabits.map(({ habit, todayEntry, todayState }, index) => {
              const color =
                lifeAreaColorConfig[
                  entityColorKey(
                    habit.color,
                    habit.lifeAreaId ? lifeAreaById.get(habit.lifeAreaId) ?? null : null,
                    habit.id,
                  )
                ];
              return (
                <motion.li
                  key={habit.id}
                  variants={listEntrance}
                  initial="hidden"
                  animate="visible"
                  custom={index}
                  // Wraps rather than crushing the name: in the narrow right
                  // rail a numeric habit's control ("8 / 8 glasses  Log") left
                  // so little room that names truncated to "Drin...".
                  className="relative flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:bottom-0 [&:not(:last-child)]:after:left-3 [&:not(:last-child)]:after:right-0 [&:not(:last-child)]:after:h-px [&:not(:last-child)]:after:bg-separator"
                >
                  {/* One indicator only: the 8px system-color dot (spec section 8). */}
                  <span className={cn("size-2 shrink-0 rounded-full", color.dot)} aria-hidden />
                  <span
                    className={cn(
                      "min-w-24 flex-1 truncate text-body transition-colors",
                      todayState === "done" ? "text-label-tertiary line-through" : "text-label",
                    )}
                  >
                    {habit.name}
                  </span>
                  <HabitLogControl
                    habit={{ type: habit.type, targetValue: habit.targetValue, unit: habit.unit }}
                    entry={todayEntry}
                    onLog={(input) => log(habit.id, input)}
                    onClear={() => clear(habit.id)}
                  />
                </motion.li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
