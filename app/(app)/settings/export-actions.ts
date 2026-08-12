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
import { addDays, zonedToday } from "@/lib/date";
import { requireUser } from "@/lib/session";

/**
 * Export everything this user owns as one JSON document.
 *
 * A single-owner life system with no way to get the data back out is a real
 * risk, not a missing nicety: without this the only copy of years of goals,
 * habits and reflections lives in one Neon database with no user-accessible
 * escape hatch.
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
  const today = zonedToday(new Date());

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
