/**
 * The backup manifest, in its own side-effect-free module.
 *
 * These constants live here rather than in scripts/backup.mts because that file
 * is a script: importing it RUNS it. restore-check.mts needs the table list,
 * and importing it from the script meant validating a dump silently took
 * another dump. A shared constant must never be reachable only through
 * something that does work on import.
 */

/**
 * All 19 tables, parents before children.
 *
 * Order matters for a JSON dump that may later be replayed: inserting a task
 * before its user violates the foreign key. Auth tables come first because
 * every domain row cascades from `user`.
 */
export const BACKUP_TABLES = [
  // Better Auth
  "user",
  "session",
  "account",
  "verification",
  // Domain, parents first
  "life_areas",
  "goals",
  "goal_progress_updates",
  "tasks",
  "habits",
  "habit_schedules",
  "habit_entries",
  "focus_sessions",
  "brain_dump_items",
  "daily_priorities",
  "task_maps",
  "task_map_nodes",
  "task_map_edges",
  "weekly_reviews",
  "user_settings",
] as const;

/** Envelope marker written into every JSON dump and checked on validation. */
export const BACKUP_FORMAT = "goha.backup.v1";
