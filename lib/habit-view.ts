import type { HabitWithSchedule } from "@/db/repositories/habits";
import type { HabitEntry } from "@/db";
import { addDays, startOfWeek, weekdayOf, type IsoDate, type Weekday } from "@/lib/date";
import {
  computeHabitStreaks,
  entryOutcome,
  isDayScheduled,
  type EntryLike,
  type HabitLike,
  type ScheduleLike,
  type Streaks,
} from "@/lib/habit-streaks";
import { toNumberOrNull, type DayCellState } from "@/lib/habits";

/**
 * Presentation-ready derivation shared by the Habits module and the Today
 * dashboard, built from the SAME canonical habits + entries (CLAUDE.md 7). Pure
 * and client-safe: converts DB rows into the domain shapes and computes streaks,
 * today's state, and the current week's cells.
 */

export type HabitDayCell = { date: IsoDate; weekday: Weekday; state: DayCellState };

export type HabitView = {
  habit: HabitWithSchedule;
  schedule: ScheduleLike;
  streaks: Streaks;
  scheduledToday: boolean;
  todayEntry: HabitEntry | null;
  todayState: DayCellState;
  weekCells: HabitDayCell[];
};

/** Default schedule (daily) when a habit somehow has no schedule row. */
function toScheduleLike(habit: HabitWithSchedule): ScheduleLike {
  const s = habit.schedule;
  return {
    frequency: s?.frequency ?? "daily",
    daysOfWeek: s?.daysOfWeek ?? null,
    timesPerPeriod: s?.timesPerPeriod ?? null,
    startDate: s?.startDate ?? null,
  };
}

function toHabitLike(habit: HabitWithSchedule): HabitLike {
  return {
    type: habit.type,
    targetValue: toNumberOrNull(habit.targetValue),
    higherIsBetter: habit.higherIsBetter,
  };
}

function toEntryLike(entry: HabitEntry): EntryLike {
  return { entryDate: entry.entryDate, status: entry.status, value: toNumberOrNull(entry.value) };
}

/** Resolve a single day to a display state for the given habit. */
function resolveDayState(
  schedule: ScheduleLike,
  outcomes: Map<IsoDate, DayCellState>,
  date: IsoDate,
  today: IsoDate,
): DayCellState {
  const logged = outcomes.get(date);
  if (logged) return logged;
  if (!isDayScheduled(schedule, date)) return "off";
  return date < today ? "miss" : "pending"; // today/future scheduled but unlogged = pending
}

export function buildHabitViews(params: {
  habits: HabitWithSchedule[];
  entries: HabitEntry[];
  today: IsoDate;
  weekStartsOn?: Weekday;
}): HabitView[] {
  const { habits, entries, today } = params;
  const weekStartsOn = params.weekStartsOn ?? 1;
  const weekStart = startOfWeek(today, weekStartsOn);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const entriesByHabit = new Map<string, HabitEntry[]>();
  for (const entry of entries) {
    const list = entriesByHabit.get(entry.habitId) ?? [];
    list.push(entry);
    entriesByHabit.set(entry.habitId, list);
  }

  return habits.map((habit) => {
    const schedule = toScheduleLike(habit);
    const habitLike = toHabitLike(habit);
    const habitEntries = entriesByHabit.get(habit.id) ?? [];

    const outcomes = new Map<IsoDate, DayCellState>();
    for (const entry of habitEntries) {
      outcomes.set(entry.entryDate, entryOutcome(habitLike, toEntryLike(entry)));
    }

    const streaks = computeHabitStreaks({
      habit: habitLike,
      schedule,
      entries: habitEntries.map(toEntryLike),
      today,
      weekStartsOn,
    });

    const todayEntry = habitEntries.find((e) => e.entryDate === today) ?? null;

    return {
      habit,
      schedule,
      streaks,
      scheduledToday: isDayScheduled(schedule, today),
      todayEntry,
      todayState: resolveDayState(schedule, outcomes, today, today),
      weekCells: weekDates.map((date) => ({
        date,
        weekday: weekdayOf(date),
        state: resolveDayState(schedule, outcomes, date, today),
      })),
    };
  });
}

/** Habits due today (scheduled), for the Today checklist and overview. */
export function todayHabitViews(views: HabitView[]): HabitView[] {
  return views.filter((v) => v.scheduledToday);
}

export type TodayHabit = {
  habit: HabitWithSchedule;
  todayEntry: HabitEntry | null;
  todayState: DayCellState;
};

/**
 * Lightweight derivation for the Today dashboard: the habits scheduled today and
 * their state, needing only today's entries (no streak history walk). Uses the
 * SAME habits + entries as the Habits module.
 */
export function deriveTodayHabits(
  habits: HabitWithSchedule[],
  todaysEntries: HabitEntry[],
  today: IsoDate,
): TodayHabit[] {
  const result: TodayHabit[] = [];
  for (const habit of habits) {
    const schedule = toScheduleLike(habit);
    if (!isDayScheduled(schedule, today)) continue;
    const entry = todaysEntries.find((e) => e.habitId === habit.id && e.entryDate === today) ?? null;
    const state: DayCellState = entry ? entryOutcome(toHabitLike(habit), toEntryLike(entry)) : "pending";
    result.push({ habit, todayEntry: entry, todayState: state });
  }
  return result;
}
