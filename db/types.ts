/**
 * Inferred row and insert types for every table. These are type-only exports
 * (erased at build time), so they are safe to import from client components as
 * well as server code, while the actual queries stay behind the repositories.
 */
import type {
  account,
  automationRequests,
  automationJobs,
  automationTokens,
  dailyInspirations,
  dailyQuotes,
  inspirationTakeaways,
  notificationLog,
  pushDeliveries,
  pushPairingSessions,
  pushSubscriptions,
  brainDumpItems,
  dailyPriorities,
  dayPlanAllocations,
  dayPlanItems,
  dayPlans,
  plannerDefaultCategories,
  focusSessions,
  goalProgressUpdates,
  goals,
  habitEntries,
  invites,
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
  weeklyReviews,
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

export type DayPlan = typeof dayPlans.$inferSelect;
export type NewDayPlan = typeof dayPlans.$inferInsert;
export type DayPlanAllocation = typeof dayPlanAllocations.$inferSelect;
export type NewDayPlanAllocation = typeof dayPlanAllocations.$inferInsert;
export type DayPlanItem = typeof dayPlanItems.$inferSelect;
export type NewDayPlanItem = typeof dayPlanItems.$inferInsert;
export type PlannerDefaultCategory = typeof plannerDefaultCategories.$inferSelect;
export type NewPlannerDefaultCategory = typeof plannerDefaultCategories.$inferInsert;

export type TaskMap = typeof taskMaps.$inferSelect;
export type NewTaskMap = typeof taskMaps.$inferInsert;
export type TaskMapNode = typeof taskMapNodes.$inferSelect;
export type NewTaskMapNode = typeof taskMapNodes.$inferInsert;
export type TaskMapEdge = typeof taskMapEdges.$inferSelect;
export type NewTaskMapEdge = typeof taskMapEdges.$inferInsert;

export type WeeklyReview = typeof weeklyReviews.$inferSelect;
export type NewWeeklyReview = typeof weeklyReviews.$inferInsert;

export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;

export type AutomationToken = typeof automationTokens.$inferSelect;
export type NewAutomationToken = typeof automationTokens.$inferInsert;
export type AutomationRequest = typeof automationRequests.$inferSelect;
export type NewAutomationRequest = typeof automationRequests.$inferInsert;
export type NotificationLogEntry = typeof notificationLog.$inferSelect;
export type NewNotificationLogEntry = typeof notificationLog.$inferInsert;
export type AutomationJob = typeof automationJobs.$inferSelect;
export type NewAutomationJob = typeof automationJobs.$inferInsert;
export type PushSubscriptionRecord = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRecord = typeof pushSubscriptions.$inferInsert;
export type PushPairingSession = typeof pushPairingSessions.$inferSelect;
export type NewPushPairingSession = typeof pushPairingSessions.$inferInsert;
export type PushDelivery = typeof pushDeliveries.$inferSelect;
export type NewPushDelivery = typeof pushDeliveries.$inferInsert;
export type DailyInspirationRow = typeof dailyInspirations.$inferSelect;
export type NewDailyInspiration = typeof dailyInspirations.$inferInsert;
export type DailyQuote = typeof dailyQuotes.$inferSelect;
export type NewDailyQuote = typeof dailyQuotes.$inferInsert;
export type InspirationTakeaway = typeof inspirationTakeaways.$inferSelect;
export type NewInspirationTakeaway = typeof inspirationTakeaways.$inferInsert;

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
