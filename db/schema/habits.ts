import { boolean, check, date, index, integer, numeric, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";
import { goals } from "./goals";
import { lifeAreas } from "./life-areas";
import { habitEntryStatus, habitFrequency, habitType } from "./enums";

/**
 * Habits. Boolean (done/not-done) or numeric (a counted quantity toward a
 * target). Archived, never hard-deleted (CLAUDE.md section 7).
 */
export const habits = pgTable(
  "habits",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lifeAreaId: uuid().references(() => lifeAreas.id, { onDelete: "set null" }),
    goalId: uuid().references(() => goals.id, { onDelete: "set null" }),
    name: text().notNull(),
    description: text(),
    type: habitType().notNull().default("boolean"),
    /** Numeric habits: daily target and its unit (e.g. 8, "glasses"). */
    targetValue: numeric({ precision: 12, scale: 4 }),
    unit: text(),
    /** true when a higher value is better (default); false for "at most" goals. */
    higherIsBetter: boolean().notNull().default(true),
    color: text(),
    icon: text(),
    sortOrder: integer().notNull().default(0),
    isArchived: boolean().notNull().default(false),
    archivedAt: timestamp({ withTimezone: true }),
    ...auditTimestamps,
  },
  (t) => [
    index("habits_user_id_idx").on(t.userId),
    index("habits_user_active_idx").on(t.userId, t.isArchived),
    index("habits_life_area_id_idx").on(t.lifeAreaId),
    check(
      "habits_numeric_requires_target",
      sql`${t.type} <> 'numeric' or ${t.targetValue} is not null`,
    ),
  ],
);

/**
 * Habit schedules: when a habit is expected. Kept in its own table so a habit's
 * cadence can change over time (rows carry `isActive` and optional date bounds).
 * `daysOfWeek` (0=Sunday..6=Saturday) and `daysOfMonth` (1..31) refine weekly
 * and monthly frequencies.
 */
export const habitSchedules = pgTable(
  "habit_schedules",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    habitId: uuid()
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    frequency: habitFrequency().notNull().default("daily"),
    daysOfWeek: integer().array(),
    daysOfMonth: integer().array(),
    /** e.g. 3 = three times per period; null = every applicable day. */
    timesPerPeriod: smallint(),
    startDate: date(),
    endDate: date(),
    isActive: boolean().notNull().default(true),
    ...auditTimestamps,
  },
  (t) => [
    index("habit_schedules_habit_id_idx").on(t.habitId),
    index("habit_schedules_user_id_idx").on(t.userId),
    /**
     * One ACTIVE schedule per habit, enforced by the database (audit R-08).
     * "One per habit by convention" was exactly the problem: the upsert read
     * for an existing schedule and then inserted, so two saves arriving
     * together left a habit with two active cadences and every screen picking
     * whichever it read first. Inactive history rows are unaffected.
     */
    uniqueIndex("habit_schedules_one_active_per_habit_uq")
      .on(t.habitId)
      .where(sql`${t.isActive}`),
  ],
);

/**
 * Habit entries: one logged occurrence per habit per local date. Carries BOTH
 * `entryDate DATE` (the Asia/Manila calendar date it counts toward) and
 * `createdAt TIMESTAMPTZ` (the real instant it was logged), per CLAUDE.md
 * section 6. A habit done at 12:30 AM Manila belongs to that local date.
 *
 * The unique (habitId, entryDate) constraint enforces one entry per day and
 * makes logging an idempotent upsert.
 */
export const habitEntries = pgTable(
  "habit_entries",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    habitId: uuid()
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    entryDate: date().notNull(),
    /** done / missed / skipped. For numeric habits, `value` refines done vs partial. */
    status: habitEntryStatus().notNull().default("done"),
    /** Numeric habits: the recorded quantity for the day (preserved verbatim). */
    value: numeric({ precision: 12, scale: 4 }),
    note: text(),
    ...auditTimestamps,
  },
  (t) => [
    unique("habit_entries_habit_id_entry_date_uq").on(t.habitId, t.entryDate),
    index("habit_entries_user_entry_date_idx").on(t.userId, t.entryDate),
    check(
      "habit_entries_value_non_negative",
      sql`${t.value} is null or ${t.value} >= 0`,
    ),
  ],
);
