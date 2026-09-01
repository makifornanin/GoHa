import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";
import { lifeAreas } from "./life-areas";
import { tasks } from "./tasks";

/**
 * The Day Planner: a day has 24 hours, and this is where they go.
 *
 * A CAPACITY tool, not a calendar. It answers "does what I intend to do fit in
 * the day I actually have" and deliberately not "at what o'clock". The
 * distinction is the whole design: an hourly grid demands a start time for
 * everything, and the honest answer to "when will I write the case study" is
 * usually "sometime in the eight hours I call work", not "10:15".
 *
 * Nothing here is a second copy of a to-do. An allocation reserves HOURS in a
 * category; a suggestion points at a `task_id` and the to-do keeps living in
 * `tasks` with its own status, dates and goal (CLAUDE.md section 7). Confirming
 * a plan writes `scheduled_for` on those real rows, which is what makes them
 * appear on Today.
 */

/**
 * Where a planner category comes from.
 *
 * The hybrid model, and the reason this is an enum rather than a nullable FK
 * alone. `life_area` categories are backed by a real Life Area, so GoHa can
 * suggest actual work for them. `planner` categories are the rest of a day:
 * Sleep, Commute, Family, Free time. Those consume real hours and must be in
 * the arithmetic, but they are NOT life areas and forcing them to become ones
 * would fill a person's Life Areas screen with things that have no goals, no
 * progress and nothing to complete.
 */
export const plannerCategoryKind = pgEnum("planner_category_kind", ["life_area", "planner"]);

/**
 * One user's plan for one local calendar date.
 *
 * `planDate` is a DATE in the user's own zone (CLAUDE.md section 6): a plan made
 * at 00:30 in Manila belongs to that day, not to the previous UTC one. Unique
 * per user and date, so re-opening the planner edits the same plan rather than
 * accumulating a new one per visit.
 */
export const dayPlans = pgTable(
  "day_plans",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planDate: date().notNull(),
    ...auditTimestamps,
  },
  (t) => [
    unique("day_plans_user_plan_date_uq").on(t.userId, t.planDate),
    index("day_plans_user_date_idx").on(t.userId, t.planDate),
  ],
);

/**
 * A slice of the day: this many minutes, for this category.
 *
 * Minutes rather than hours so half-hour allocations need no decimal column and
 * no rounding decisions; the UI presents hours. The 24-hour total is NOT
 * enforced by a constraint, on purpose: going over is a real state a person can
 * be in, and the product's job is to say so clearly rather than to refuse the
 * save and lose what they typed.
 *
 * A `life_area` row carries `lifeAreaId`; a `planner` row carries a `label`.
 * The check constraint below makes the wrong combination unstorable rather than
 * merely discouraged, so a category can never be both or neither.
 */
export const dayPlanAllocations = pgTable(
  "day_plan_allocations",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dayPlanId: uuid()
      .notNull()
      .references(() => dayPlans.id, { onDelete: "cascade" }),
    kind: plannerCategoryKind().notNull(),
    /**
     * The backing Life Area, for `kind = 'life_area'`.
     *
     * `set null` rather than cascade: deleting a life area must not silently
     * delete hours out of a plan the user already made. The row survives with
     * its own label as a plain planner category, which is the truthful outcome.
     */
    lifeAreaId: uuid().references(() => lifeAreas.id, { onDelete: "set null" }),
    /** The display name. Always present, including for life-area rows. */
    label: text().notNull(),
    minutes: integer().notNull(),
    sortOrder: integer().notNull().default(0),
    /**
     * Presentation, reusing the Life Area vocabulary (`lib/life-areas.ts`).
     *
     * Nullable so an untouched category keeps deriving its colour from its id,
     * exactly as life-area cards already do. Storing a key rather than a hex
     * keeps the palette swappable and the theme in charge of the actual value.
     */
    color: text(),
    /** lucide-react icon key, from the same groups Life Areas offer. */
    icon: text(),
    ...auditTimestamps,
  },
  (t) => [
    index("day_plan_allocations_plan_idx").on(t.dayPlanId, t.sortOrder),
    index("day_plan_allocations_user_idx").on(t.userId),
    /*
     * One row per category per plan, enforced two ways.
     *
     * Two "Work" rows would each draw a capacity bar and each accept
     * suggestions, and the day would silently be counted twice, which is the
     * one thing a capacity planner must never do.
     *
     * The LABEL index deliberately covers every row rather than only the
     * planner-only ones. Keying life-area rows by id alone leaves a trap: a
     * plan holding both a "Health" life area and a "Health" planner category is
     * fine until the life area is deleted, at which point `set null` turns the
     * first row into a second label-keyed "Health" and the delete fails on a
     * constraint the user cannot see. Making the name unique plan-wide removes
     * the trap AND is the better rule, since two bars with the same name are
     * unreadable whatever backs them.
     */
    uniqueIndex("day_plan_allocations_label_uq").on(t.dayPlanId, sql`lower(${t.label})`),
    uniqueIndex("day_plan_allocations_life_area_uq")
      .on(t.dayPlanId, t.lifeAreaId)
      .where(sql`${t.lifeAreaId} is not null`),
    check(
      "day_plan_allocations_kind_matches_link",
      sql`(${t.kind} = 'life_area') or (${t.kind} = 'planner' and ${t.lifeAreaId} is null)`,
    ),
    /*
     * A slice is at least 15 minutes and at most a whole day.
     *
     * The floor matches the smallest estimate the to-do form offers, so a
     * category can always hold at least one piece of work. The ceiling is the
     * day itself: a single allocation longer than 24 hours is arithmetic that
     * cannot be true, whatever the total says.
     */
    check("day_plan_allocations_minutes_range", sql`${t.minutes} between 15 and 1440`),
  ],
);

/**
 * A to-do the user has accepted into a category for that day.
 *
 * The record of an APPROVAL, which is the rule this table exists to enforce:
 * GoHa may recommend, but nothing reaches Today until the user confirms
 * (CLAUDE.md section 10, and the brief's user-approval rule). A suggestion the
 * user has not accepted is never written here; it is computed and shown.
 *
 * `plannedMinutes` is a snapshot of what the day was planned around. It starts
 * from the to-do's `estimate_minutes` and the user may override it here without
 * rewriting the to-do's own estimate, because "this will take me 2h today" and
 * "this task is a 2h task" are different claims.
 */
export const dayPlanItems = pgTable(
  "day_plan_items",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * The plan this belongs to, carried alongside the allocation.
     *
     * Denormalized on purpose, and the reason is the constraint below: "one
     * to-do per DAY" cannot be expressed against `allocation_id`, which only
     * knows about one category. It also makes reading a whole plan one index
     * scan instead of a join through every allocation.
     */
    dayPlanId: uuid()
      .notNull()
      .references(() => dayPlans.id, { onDelete: "cascade" }),
    allocationId: uuid()
      .notNull()
      .references(() => dayPlanAllocations.id, { onDelete: "cascade" }),
    /**
     * The real to-do, for a LINKED entry. CASCADES: this row is a pointer into
     * a plan, so if the to-do is deleted the pointer is meaningless and must go
     * with it. The to-do itself is never deleted BY the planner.
     *
     * Nullable since the freeform redesign: an entry is either a pointer at a
     * to-do or a plain line of text the user typed. "Client work" and "Walk the
     * dog" are real parts of a day that were never going to be to-dos, and
     * forcing them to become ones filled the Tasks screen with things that have
     * no due date, no goal and nothing to complete.
     */
    taskId: uuid().references(() => tasks.id, { onDelete: "cascade" }),
    /**
     * The text of a FREEFORM entry. Mutually exclusive with `taskId`, enforced
     * by the check below rather than by convention: a row carrying both would
     * render two different names for one block of time, and a row carrying
     * neither is an unlabelled item that nothing can display.
     *
     * Reserved time with no entry at all is NOT this: that is simply a category
     * with minutes and no items, which needs no row here.
     */
    label: text(),
    plannedMinutes: smallint().notNull(),
    /**
     * Manually recorded time, for a FREEFORM entry only.
     *
     * The two entry kinds are tracked by different means on purpose. A linked
     * to-do already has an automatic, timestamped record of the time spent on
     * it (its focus sessions), so copying that total into this column would be
     * a second source of truth that starts drifting the moment either side
     * changes. A freeform activity has no such record and never will, because
     * "Gym" and "Netflix" are not to-dos and building a second timer for them
     * would be a whole parallel tracking system.
     *
     * So: derived for linked entries, stored for freeform ones, and the check
     * below makes the wrong combination unstorable rather than merely
     * discouraged. Null means "not recorded", which is different from a
     * recorded zero.
     */
    actualMinutes: smallint(),
    sortOrder: integer().notNull().default(0),
    ...auditTimestamps,
  },
  (t) => [
    index("day_plan_items_allocation_idx").on(t.allocationId, t.sortOrder),
    index("day_plan_items_plan_idx").on(t.dayPlanId),
    index("day_plan_items_user_idx").on(t.userId),
    index("day_plan_items_task_idx").on(t.taskId),
    /*
     * A to-do sits in at most one category of a plan.
     *
     * Keyed on the PLAN, not the allocation. Accepting the same suggestion in
     * Work and again in Study would otherwise book its hours twice and the day
     * would read as fuller than it is, which is the exact failure a capacity
     * planner cannot have.
     */
    unique("day_plan_items_plan_task_uq").on(t.dayPlanId, t.taskId),
    check("day_plan_items_minutes_range", sql`${t.plannedMinutes} between 5 and 1440`),
    /*
     * Exactly one of the two identities.
     *
     * Postgres treats NULLs as distinct in a UNIQUE, so the plan/task index
     * above still stops one to-do being booked twice while leaving any number
     * of freeform lines free to coexist. That only holds while a freeform row
     * really does carry a null task, which is what this enforces.
     */
    check(
      "day_plan_items_task_or_label",
      sql`(${t.taskId} is not null and ${t.label} is null) or (${t.taskId} is null and ${t.label} is not null)`,
    ),
    /*
     * Manual actuals belong to freeform entries alone.
     *
     * A linked to-do's actual time is DERIVED from its focus sessions. Letting
     * a row carry both would create two answers to "how long did this take",
     * and the one the UI happened to read would win. The database refusing it
     * is what makes "never persisted redundantly" a fact rather than an
     * intention.
     */
    check(
      "day_plan_items_actual_manual_only",
      sql`${t.actualMinutes} is null or ${t.taskId} is null`,
    ),
    check(
      "day_plan_items_actual_range",
      sql`${t.actualMinutes} is null or ${t.actualMinutes} between 0 and 1440`,
    ),
  ],
);

/**
 * The user's REUSABLE default categories: their normal day, saved once.
 *
 * The hybrid model the planner is built on. These are a template and never a
 * plan: opening a date with no plan yet offers to seed it from here, and from
 * that moment the two are independent. Editing Tuesday must not quietly rewrite
 * what every future day starts from, and the only thing that writes this table
 * is the explicit "Save as my default day" action.
 *
 * Deliberately the same shape as `day_plan_allocations` minus the plan: seeding
 * is then a copy rather than a translation, and there is one set of rules about
 * what a category is.
 */
export const plannerDefaultCategories = pgTable(
  "planner_default_categories",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: plannerCategoryKind().notNull(),
    lifeAreaId: uuid().references(() => lifeAreas.id, { onDelete: "set null" }),
    label: text().notNull(),
    minutes: integer().notNull(),
    sortOrder: integer().notNull().default(0),
    color: text(),
    icon: text(),
    ...auditTimestamps,
  },
  (t) => [
    index("planner_default_categories_user_idx").on(t.userId, t.sortOrder),
    // Same uniqueness rules as a plan's categories, and for the same reasons:
    // two "Work" defaults would seed two bars that each look authoritative.
    uniqueIndex("planner_default_categories_label_uq").on(t.userId, sql`lower(${t.label})`),
    uniqueIndex("planner_default_categories_life_area_uq")
      .on(t.userId, t.lifeAreaId)
      .where(sql`${t.lifeAreaId} is not null`),
    check(
      "planner_default_categories_kind_matches_link",
      sql`(${t.kind} = 'life_area') or (${t.kind} = 'planner' and ${t.lifeAreaId} is null)`,
    ),
    check("planner_default_categories_minutes_range", sql`${t.minutes} between 15 and 1440`),
  ],
);
