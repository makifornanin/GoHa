import type { HabitWithSchedule } from "@/db/repositories/habits";
import type { HabitEntry } from "@/db";
import {
  addDays,
  MANILA_TZ,
  startOfWeek,
  toZonedDate,
  weekdayOf,
  type IsoDate,
  type Weekday,
} from "@/lib/date";
import { habitOutcome, toDayCellState } from "@/lib/habit-outcome";
import {
  computeHabitStreaks,
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

export type HabitDayCell = {
  date: IsoDate;
  weekday: Weekday;
  state: DayCellState;
  /** The one cell the user can still act on. */
  isToday: boolean;
};

export type HabitView = {
  habit: HabitWithSchedule;
  schedule: ScheduleLike;
  streaks: Streaks;
  scheduledToday: boolean;
  todayEntry: HabitEntry | null;
  todayState: DayCellState;
  weekCells: HabitDayCell[];
};

/**
 * Default schedule (daily) when a habit somehow has no schedule row.
 *
 * `startDate` falls back to the day the habit was CREATED. Without that floor a
 * habit was treated as scheduled for all of recorded history, so every day
 * before it existed rendered as "Missed": a brand new habit greeted the user
 * with a wall of red and a broken streak it never had a chance to keep. A habit
 * cannot be missed before it exists.
 */
function toScheduleLike(habit: HabitWithSchedule, timeZone: string): ScheduleLike {
  const s = habit.schedule;
  return {
    frequency: s?.frequency ?? "daily",
    daysOfWeek: s?.daysOfWeek ?? null,
    timesPerPeriod: s?.timesPerPeriod ?? null,
    startDate: s?.startDate ?? toZonedDate(habit.createdAt, timeZone),
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

/**
 * Resolve a single day to a display state for the given habit.
 *
 * Delegates to the shared definition (audit R-06). This function used to carry
 * its own copy of the entry-wins / off-schedule / past-is-a-miss precedence,
 * which is one of the three copies that disagreed.
 */
function resolveDayState(
  habit: HabitLike,
  schedule: ScheduleLike,
  entryByDate: Map<IsoDate, EntryLike>,
  date: IsoDate,
  today: IsoDate,
): DayCellState {
  return toDayCellState(
    habitOutcome({
      habit,
      entry: entryByDate.get(date) ?? null,
      scheduled: isDayScheduled(schedule, date),
      date,
      today,
    }),
  );
}

export function buildHabitViews(params: {
  habits: HabitWithSchedule[];
  entries: HabitEntry[];
  today: IsoDate;
  weekStartsOn?: Weekday;
  timeZone?: string;
}): HabitView[] {
  const { habits, entries, today } = params;
  const weekStartsOn = params.weekStartsOn ?? 1;
  const timeZone = params.timeZone ?? MANILA_TZ;
  const weekStart = startOfWeek(today, weekStartsOn);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const entriesByHabit = new Map<string, HabitEntry[]>();
  for (const entry of entries) {
    const list = entriesByHabit.get(entry.habitId) ?? [];
    list.push(entry);
    entriesByHabit.set(entry.habitId, list);
  }

  return habits.map((habit) => {
    const schedule = toScheduleLike(habit, timeZone);
    const habitLike = toHabitLike(habit);
    const habitEntries = entriesByHabit.get(habit.id) ?? [];

    const entryByDate = new Map<IsoDate, EntryLike>();
    for (const entry of habitEntries) entryByDate.set(entry.entryDate, toEntryLike(entry));

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
      todayState: resolveDayState(habitLike, schedule, entryByDate, today, today),
      weekCells: weekDates.map((date) => ({
        date,
        weekday: weekdayOf(date),
        state: resolveDayState(habitLike, schedule, entryByDate, date, today),
        isToday: date === today,
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
  timeZone: string = MANILA_TZ,
): TodayHabit[] {
  const result: TodayHabit[] = [];
  for (const habit of habits) {
    const schedule = toScheduleLike(habit, timeZone);
    if (!isDayScheduled(schedule, today)) continue;
    const entry = todaysEntries.find((e) => e.habitId === habit.id && e.entryDate === today) ?? null;
    // `scheduled: true` because the loop above already skipped anything not due
    // today. Same shared definition as the grid, so Today and Habits agree.
    const state: DayCellState = toDayCellState(
      habitOutcome({
        habit: toHabitLike(habit),
        entry: entry ? toEntryLike(entry) : null,
        scheduled: true,
        date: today,
        today,
      }),
    );
    result.push({ habit, todayEntry: entry, todayState: state });
  }
  return result;
}
