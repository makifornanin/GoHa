import "server-only";

import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

import type { IsoDate } from "@/lib/date";
import { db } from "../client";
import { habitEntries, habitSchedules, habits } from "../schema";
import type { HabitEntryStatus, HabitFrequency, HabitType } from "../schema";
import type { Habit, HabitEntry, HabitSchedule } from "../types";

/** Habits repository (habits + habit_schedules + habit_entries). User-scoped. */

export type HabitInput = {
  name: string;
  description?: string | null;
  lifeAreaId?: string | null;
  goalId?: string | null;
  type?: HabitType;
  targetValue?: string | null;
  unit?: string | null;
  higherIsBetter?: boolean;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
};

export type HabitScheduleInput = {
  frequency?: HabitFrequency;
  daysOfWeek?: number[] | null;
  daysOfMonth?: number[] | null;
  timesPerPeriod?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean;
};

/** A habit joined with its active schedule (one per habit by convention). */
export type HabitWithSchedule = Habit & { schedule: HabitSchedule | null };

// --- Habits ---

export async function listHabits(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Habit[]> {
  const where = options.includeArchived
    ? eq(habits.userId, userId)
    : and(eq(habits.userId, userId), eq(habits.isArchived, false));
  return db.select().from(habits).where(where).orderBy(asc(habits.sortOrder), asc(habits.createdAt));
}

/** Habits with their active schedule attached, for the list, streaks, and Today. */
export async function listHabitsWithSchedule(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<HabitWithSchedule[]> {
  const [rows, schedules] = await Promise.all([
    listHabits(userId, options),
    db
      .select()
      .from(habitSchedules)
      .where(and(eq(habitSchedules.userId, userId), eq(habitSchedules.isActive, true))),
  ]);
  const byHabit = new Map(schedules.map((s) => [s.habitId, s]));
  return rows.map((habit) => ({ ...habit, schedule: byHabit.get(habit.id) ?? null }));
}

export async function getHabit(userId: string, id: string): Promise<Habit | null> {
  const [row] = await db
    .select()
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createHabit(userId: string, input: HabitInput): Promise<Habit> {
  const [row] = await db
    .insert(habits)
    .values({ ...input, userId })
    .returning();
  return row;
}

export async function updateHabit(
  userId: string,
  id: string,
  input: Partial<HabitInput>,
): Promise<Habit | null> {
  const [row] = await db
    .update(habits)
    .set(input)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .returning();
  return row ?? null;
}

export async function archiveHabit(userId: string, id: string): Promise<Habit | null> {
  const [row] = await db
    .update(habits)
    .set({ isArchived: true, archivedAt: new Date() })
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .returning();
  return row ?? null;
}

/**
 * Bring an archived habit back, with its entry history intact.
 *
 * Archiving is meant to be reversible (CLAUDE.md section 7: prefer archive over
 * hard delete), but habits had no way back, so a mis-click destroyed a streak's
 * visibility permanently. Entries were never deleted, so restoring returns the
 * habit and its whole history.
 */
export async function restoreHabit(userId: string, id: string): Promise<Habit | null> {
  const [row] = await db
    .update(habits)
    .set({ isArchived: false, archivedAt: null })
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .returning();
  return row ?? null;
}

// --- Schedules (one active schedule per habit) ---

export async function getHabitSchedule(userId: string, habitId: string): Promise<HabitSchedule | null> {
  const [row] = await db
    .select()
    .from(habitSchedules)
    .where(
      and(
        eq(habitSchedules.userId, userId),
        eq(habitSchedules.habitId, habitId),
        eq(habitSchedules.isActive, true),
      ),
    )
    .orderBy(desc(habitSchedules.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Update the habit's active schedule in place, or create it if none exists.
 *
 * ONE statement, resolved by the database against
 * `habit_schedules_one_active_per_habit_uq` (audit R-08). It used to read for
 * an existing schedule and then insert, so two saves arriving together both
 * found nothing and both inserted, leaving the habit with two active cadences
 * and every screen believing whichever it read first.
 *
 * A schedule being deactivated cannot use the conflict path, because the
 * partial index only covers active rows; that case updates the current active
 * row by id instead.
 */
export async function upsertHabitSchedule(
  userId: string,
  habitId: string,
  input: HabitScheduleInput,
): Promise<HabitSchedule> {
  if (input.isActive === false) {
    const existing = await getHabitSchedule(userId, habitId);
    if (!existing) {
      const [inserted] = await db
        .insert(habitSchedules)
        .values({ ...input, userId, habitId })
        .returning();
      return inserted;
    }
    const [row] = await db
      .update(habitSchedules)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(habitSchedules.id, existing.id), eq(habitSchedules.userId, userId)))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(habitSchedules)
    .values({ ...input, userId, habitId, isActive: true })
    .onConflictDoUpdate({
      target: habitSchedules.habitId,
      targetWhere: eq(habitSchedules.isActive, true),
      set: { ...input, isActive: true, updatedAt: new Date() },
      // Ownership stays a condition of the write itself, not only of the
      // caller's earlier check.
      setWhere: eq(habitSchedules.userId, userId),
    })
    .returning();
  return row;
}

// --- Entries (one per habit per local date) ---

/**
 * Log (or update) a habit entry for a local date. The unique (habitId,
 * entryDate) constraint makes this an idempotent upsert: repeated clicks edit the
 * existing row rather than creating duplicates. Numeric `value` is preserved.
 */
export async function logHabitEntry(
  userId: string,
  habitId: string,
  entryDate: IsoDate,
  input: { status?: HabitEntryStatus; value?: string | null; note?: string | null } = {},
): Promise<HabitEntry> {
  const [row] = await db
    .insert(habitEntries)
    .values({
      userId,
      habitId,
      entryDate,
      status: input.status ?? "done",
      value: input.value ?? null,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: [habitEntries.habitId, habitEntries.entryDate],
      set: {
        status: input.status ?? "done",
        value: input.value ?? null,
        note: input.note ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function deleteHabitEntry(
  userId: string,
  habitId: string,
  entryDate: IsoDate,
): Promise<boolean> {
  const rows = await db
    .delete(habitEntries)
    .where(
      and(
        eq(habitEntries.userId, userId),
        eq(habitEntries.habitId, habitId),
        eq(habitEntries.entryDate, entryDate),
      ),
    )
    .returning({ id: habitEntries.id });
  return rows.length > 0;
}

/** All of a user's entries within an inclusive local-date range (grid + streaks). */
export async function listEntriesInRange(
  userId: string,
  range: { from: IsoDate; to: IsoDate },
): Promise<HabitEntry[]> {
  return db
    .select()
    .from(habitEntries)
    .where(
      and(
        eq(habitEntries.userId, userId),
        gte(habitEntries.entryDate, range.from),
        lte(habitEntries.entryDate, range.to),
      ),
    )
    .orderBy(asc(habitEntries.entryDate));
}

/** Entries for a single habit within a range. */
export async function listHabitEntries(
  userId: string,
  habitId: string,
  range: { from: IsoDate; to: IsoDate },
): Promise<HabitEntry[]> {
  return db
    .select()
    .from(habitEntries)
    .where(
      and(
        eq(habitEntries.userId, userId),
        eq(habitEntries.habitId, habitId),
        gte(habitEntries.entryDate, range.from),
        lte(habitEntries.entryDate, range.to),
      ),
    )
    .orderBy(asc(habitEntries.entryDate));
}

/** All entries for a user on one local date (Today habits snapshot). */
export async function listHabitEntriesForDate(userId: string, date: IsoDate): Promise<HabitEntry[]> {
  return db
    .select()
    .from(habitEntries)
    .where(and(eq(habitEntries.userId, userId), eq(habitEntries.entryDate, date)));
}

/**
 * Hard-delete an archived habit.
 *
 * Its schedules and its whole entry history cascade away. That history is the
 * streak, so this is the one archive deletion that genuinely destroys a record
 * of what someone did; the UI says so before asking. Archived rows only.
 */
export async function deleteHabit(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId), eq(habits.isArchived, true)))
    .returning({ id: habits.id });
  return rows.length > 0;
}
