/**
 * Inferred row and insert types for every table. These are type-only exports
 * (erased at build time), so they are safe to import from client components as
 * well as server code, while the actual queries stay behind the repositories.
 */
import type {
  account,
  brainDumpItems,
  dailyPriorities,
  focusSessions,
  goalProgressUpdates,
  goals,
  habitEntries,
  habitSchedules,
  habits,
  lifeAreas,
  session,
  taskMapEdges,
  taskMapNodes,
  taskMaps,
  tasks,
  user,
  userSettings,
  verification,
} from "./schema";

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;

export type LifeArea = typeof lifeAreas.$inferSelect;
export type NewLifeArea = typeof lifeAreas.$inferInsert;

export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type GoalProgressUpdate = typeof goalProgressUpdates.$inferSelect;
export type NewGoalProgressUpdate = typeof goalProgressUpdates.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Habit = typeof habits.$inferSelect;
export type NewHabit = typeof habits.$inferInsert;
export type HabitSchedule = typeof habitSchedules.$inferSelect;
export type NewHabitSchedule = typeof habitSchedules.$inferInsert;
export type HabitEntry = typeof habitEntries.$inferSelect;
export type NewHabitEntry = typeof habitEntries.$inferInsert;

export type FocusSession = typeof focusSessions.$inferSelect;
export type NewFocusSession = typeof focusSessions.$inferInsert;

export type BrainDumpItem = typeof brainDumpItems.$inferSelect;
export type NewBrainDumpItem = typeof brainDumpItems.$inferInsert;

export type DailyPriority = typeof dailyPriorities.$inferSelect;
export type NewDailyPriority = typeof dailyPriorities.$inferInsert;

export type TaskMap = typeof taskMaps.$inferSelect;
export type NewTaskMap = typeof taskMaps.$inferInsert;
export type TaskMapNode = typeof taskMapNodes.$inferSelect;
export type NewTaskMapNode = typeof taskMapNodes.$inferInsert;
export type TaskMapEdge = typeof taskMapEdges.$inferSelect;
export type NewTaskMapEdge = typeof taskMapEdges.$inferInsert;

export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
