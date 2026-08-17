"use server";

import {
  brainDumpRepo,
  focusRepo,
  goalsRepo,
  habitsRepo,
  lifeAreasRepo,
  reviewsRepo,
  settingsRepo,
  tasksRepo,
  taskMapsRepo,
} from "@/db";
import { addDays } from "@/lib/date";
import { requireUser } from "@/lib/session";
import { getDateContext } from "@/lib/user-settings";

/**
 * A readable copy of the user's main records, as one JSON document.
 *
 * NOT a backup, and deliberately no longer described as one (audit R-04). It
 * omits task map nodes and edges, daily priorities, goal progress history, any
 * focus session still in progress, inactive habit schedules, and anything
 * beyond the caps below. Nothing in the app restores it.
 *
 * The backup is `pnpm db:backup` (scripts/backup.mts), which captures all 19
 * tables unfiltered and is validated by `pnpm db:restore-check`.
 *
 * This still earns its place: it is the copy the owner can open, read, grep and
 * move somewhere else without a Postgres client.
 *
 * Deliberately plain JSON of the CANONICAL rows rather than a derived report.
 * Derived values (goal progress, streaks, buckets) are recomputed on read
 * everywhere else, so exporting them would freeze numbers that are supposed to
 * follow the data.
 *
 * Auth rows (password hashes, sessions, tokens) are never included.
 */
export async function exportMyDataAction(): Promise<{
  filename: string;
  json: string;
}> {
  const user = await requireUser();
  // The user's own today: this bounds the habit-entry range AND names the file,
  // both of which were resolved in Manila regardless of settings (audit R-15).
  const { today } = await getDateContext(user.id);

  const [
    lifeAreas,
    goals,
    tasks,
    subtasks,
    habits,
    habitEntries,
    focusSessions,
    brainDump,
    taskMaps,
    reviews,
    settings,
  ] = await Promise.all([
    lifeAreasRepo.listLifeAreas(user.id, { includeArchived: true }),
    goalsRepo.listGoals(user.id, { includeArchived: true }),
    tasksRepo.listTasksForUser(user.id),
    tasksRepo.listSubtasksForUser(user.id),
    habitsRepo.listHabitsWithSchedule(user.id, { includeArchived: true }),
    // Ten years back: effectively "everything", without an unbounded scan.
    habitsRepo.listEntriesInRange(user.id, { from: addDays(today, -3650), to: today }),
    focusRepo.listRecentSessions(user.id, 10_000),
    brainDumpRepo.listAllBrainDumpItems(user.id),
    taskMapsRepo.listTaskMaps(user.id, { includeArchived: true }),
    reviewsRepo.listWeeklyReviews(user.id, 1000),
    settingsRepo.getOrCreateUserSettings(user.id),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    format: "goha.export.v1",
    account: { name: user.name, email: user.email },
    lifeAreas,
    goals,
    tasks,
    subtasks,
    habits,
    habitEntries,
    focusSessions,
    brainDump,
    taskMaps,
    weeklyReviews: reviews,
    settings,
  };

  return {
    filename: `goha-export-${today}.json`,
    json: JSON.stringify(payload, null, 2),
  };
}
