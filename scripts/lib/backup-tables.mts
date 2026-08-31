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
 * EVERY table, parents before children.
 *
 * Order matters for a JSON dump that may later be replayed: inserting a task
 * before its user violates the foreign key. The sequence below is a topological
 * sort of the schema's foreign keys, verified by `tests/backup-manifest.test.ts`,
 * which also fails if a table exists in the schema and is missing from here.
 *
 * That test is the point. This list said "all 19 tables" while the schema had
 * grown to 30, so a JSON dump silently omitted eleven of them, including
 * `push_subscriptions` (every paired device) and `notification_log` (the
 * delivery ledger that stops a notification being sent twice). A backup that
 * quietly drops a third of the database is worse than no backup, because it is
 * trusted. Nothing but a person noticing stood between that and a restore.
 *
 * Note that this list governs the JSON FALLBACK only. When `pg_dump` is on
 * PATH, `backup.mts` takes a native custom-format dump of the whole database
 * and never consults this array, so that path was always complete.
 */
export const BACKUP_TABLES = [
  // Install-level. No owner, no foreign keys: the singleton settings row.
  "app_settings",

  // Better Auth. First, because every domain row cascades from `user`.
  "user",
  "session",
  "account",
  "verification",

  // The chain: Life Area -> Goal -> To-do, parents first.
  "life_areas",
  "goals",
  "goal_progress_updates",
  "tasks",

  // Habits and their history.
  "habits",
  "habit_schedules",
  "habit_entries",

  // Execution.
  "focus_sessions",
  "brain_dump_items",
  "daily_priorities",

  // Day Planner (migration 0021). `day_plan_items` references tasks and
  // allocations, so it trails both.
  "day_plans",
  "day_plan_allocations",
  "day_plan_items",

  // Task maps. Nodes reference maps and tasks; edges reference nodes.
  "task_maps",
  "task_map_nodes",
  "task_map_edges",

  // Reflection.
  "weekly_reviews",
  "daily_quotes",
  "daily_inspirations",
  // Takeaways (migration 0022) reference the inspiration they respond to.
  "inspiration_takeaways",

  // Automation. Requests reference the token they were made with.
  "automation_tokens",
  "automation_requests",
  "automation_jobs",
  "notification_log",

  // Push. Deliveries reference both a subscription and a notification, so they
  // come after `notification_log` above as well as after the subscription.
  "push_subscriptions",
  "push_pairing_sessions",
  "push_deliveries",

  // People and preferences.
  "invites",
  "user_settings",
] as const;

/**
 * Envelope marker written into every JSON dump and checked on validation.
 *
 * Deliberately NOT bumped when the table list grew. The envelope's SHAPE is
 * unchanged, and a dump taken before a table existed should report that table
 * as missing, which is exactly what it is: `restore-check` calling an older
 * dump incomplete is the tool telling the truth, not a false alarm. Bumping the
 * marker would replace that accurate report with a bare "unexpected format"
 * and lose the detail of what is actually absent.
 */
export const BACKUP_FORMAT = "goha.backup.v1";
