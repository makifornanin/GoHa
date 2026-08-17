# DATABASE.md — GoHa Schema Reference

The complete GoHa schema, defined in Phase 2. This document is the human-readable
companion to the Drizzle definitions under `db/schema/`. It is the source of truth
for what each table means, how tables relate, and what happens on deletion.

Stack: Neon Serverless Postgres, Drizzle ORM, Drizzle Kit. Identity, connection,
and validation rules live in `CLAUDE.md` (sections 4 to 8). This file does not
repeat them; it records the concrete shape they produced.

## Conventions

- **Primary keys:** every table has `id uuid primary key default gen_random_uuid()`.
  One ID strategy, everywhere (CLAUDE.md section 8).
- **User scoping:** every domain table has `user_id uuid not null references user(id)
  on delete cascade`. Deleting a user removes all their data. Repositories always
  filter by the session user id; the app never trusts a client-supplied id.
- **Audit timestamps:** `created_at` and `updated_at` are `timestamptz` (real
  instants). `updated_at` bumps on every Drizzle-level update.
- **Business dates:** local calendar dates use a `date` column (`entry_date`,
  `scheduled_for`, `session_date`, `priority_date`, `start_date`, `target_date`).
  A deadline moment (`due_at`) stays `timestamptz`. See the timezone section.
- **Column casing:** TypeScript identifiers are camelCase; Postgres columns are
  snake_case. Drizzle's `casing: "snake_case"` (set identically in `db/client.ts`
  and `drizzle.config.ts`) bridges the two, so migrations and runtime agree.
- **Naming:** indexes end in `_idx`, unique constraints in `_uq`, check constraints
  are named after what they enforce.

## The connected chain

GoHa models one connected system (CLAUDE.md section 7):

```
user
 └─ user_settings (1:1)
 └─ life_areas
     └─ goals ──(self-ref parent_goal_id)── sub-goals
         └─ goal_progress_updates (journal)
         └─ tasks ──(link)── goals / life_areas
             └─ focus_sessions
             └─ daily_priorities (Top 3 per day)
             └─ brain_dump_items (converted_type + converted_entity_id)
         └─ habits
             └─ habit_schedules
             └─ habit_entries (unique per habit per local date)
     └─ task_maps
         └─ task_map_nodes ──(may reference a task)
             └─ task_map_edges (source/target node)
```

## Table summary

### Better Auth (managed by Better Auth in Phase 3)

| Table | Purpose | Notes |
|---|---|---|
| `user` | Account record | `email` unique. UUID id (Better Auth configured to emit UUIDs). |
| `session` | Login sessions | `token` unique; `user_id` cascade; indexed by `user_id`. |
| `account` | Credential/provider link | Holds the password hash for email/password; `user_id` cascade. |
| `verification` | Email/token verification | Indexed by `identifier`. |

### Domain

| Table | Purpose | Key columns |
|---|---|---|
| `life_areas` | Top of the chain; balance/Life Score inputs | `weight` (>0), `sort_order`, `is_archived` |
| `goals` | Goals and sub-goals with hierarchy | `parent_goal_id` (self ref), `status`, `timeframe`, `progress_mode` (auto/manual), `manual_progress`, `start_date`/`target_date` |
| `goal_progress_updates` | Append-only progress journal | `progress` (0-100), `note`, `created_at` only |
| `tasks` | To-dos, date-derived views | `status`, `priority`, `scheduled_for` (date), `due_at` (tz), `completed_at`, `completion_note`, `estimate_minutes` |
| `habits` | Boolean or numeric habits | `type`, `target_value`, `unit`, `higher_is_better`, `is_archived` |
| `habit_schedules` | When a habit is expected | `frequency`, `days_of_week[]`, `days_of_month[]`, `times_per_period`, `is_active` |
| `habit_entries` | One log per habit per local date | `entry_date` (date) + `created_at` (tz), `status` (done/missed/skipped), `value` |
| `focus_sessions` | Focus Mode sessions | `session_date` (date) + `started_at`/`ended_at` (tz), `paused_at`/`paused_seconds`, `status`, `planned`/`duration_seconds` (derived) |
| `brain_dump_items` | Fast capture inbox | `status`, `converted_type` (task/goal/habit), `converted_entity_id` (polymorphic, not a FK) |
| `daily_priorities` | Top 3 actions per day | `priority_date` (date), `position` (1-3), `task_id` or `label` |
| `task_maps` | React Flow canvases | `viewport` (jsonb), `is_archived` |
| `task_map_nodes` | Nodes on a canvas | `node_type`, `task_id` (optional), `position_x/y`, `data` (jsonb) |
| `task_map_edges` | Connections between nodes | `source_node_id`, `target_node_id`, unique triple |
| `user_settings` | Per-user preferences | `timezone`, `theme`, `week_starts_on` (0-6), reminder times, `preferences` (jsonb) |

## Enums

`goal_status` (not_started, active, paused, completed, dropped) ·
`goal_timeframe` (daily, weekly, monthly, quarterly, yearly) ·
`goal_progress_mode` (auto, manual) ·
`task_status` (todo, in_progress, completed, cancelled) · `priority` (low, medium, high, urgent) ·
`habit_type` (boolean, numeric) · `habit_frequency` (daily, weekly, monthly) ·
`habit_entry_status` (done, missed, skipped) ·
`focus_session_status` (in_progress, completed, abandoned) ·
`brain_dump_status` (inbox, converted, archived) ·
`brain_dump_converted_type` (task, goal, habit) ·
`theme_preference` (light, dark, system) ·
`task_map_node_type` (task, note, group, milestone).

## Key relations and deletion behavior

Deletion follows CLAUDE.md section 7: valuable entities are archived, not
hard-deleted, and every real foreign key declares its intent.

| Child | Parent | On parent delete | Rationale |
|---|---|---|---|
| all domain tables | `user` | **cascade** | A deleted account takes all its data. |
| `goals.life_area_id` | `life_areas` | **set null** | A goal outlives its area; area deletion never destroys goals. |
| `goals.parent_goal_id` | `goals` | **cascade** | Deleting a parent goal removes its sub-goals. |
| `goal_progress_updates.goal_id` | `goals` | **cascade** | Journal belongs to its goal. |
| `tasks.goal_id` | `goals` | **set null** | A task survives if its goal is removed. |
| `tasks.life_area_id` | `life_areas` | **set null** | Same as goals. |
| `habits.life_area_id` / `habits.goal_id` | `life_areas` / `goals` | **set null** | Habit keeps running, just unlinked. |
| `habit_schedules.habit_id` | `habits` | **cascade** | Schedule belongs to its habit. |
| `habit_entries.habit_id` | `habits` | **cascade** | Log belongs to its habit. |
| `focus_sessions.task_id` | `tasks` | **set null** | Session history is retained if the task is deleted. |
| `brain_dump_items.converted_entity_id` | (none) | polymorphic (task/goal/habit), so no FK; the item records what it became and is not cascade-linked. |
| `daily_priorities.task_id` | `tasks` | **cascade** | A priority slot is meaningless without its task. |
| `task_maps.goal_id` / `life_area_id` | `goals` / `life_areas` | **set null** | Map survives. |
| `task_map_nodes.task_map_id` | `task_maps` | **cascade** | Nodes belong to the map. |
| `task_map_nodes.task_id` | `tasks` | **set null** | Node becomes a plain node if its task is deleted. |
| `task_map_edges.task_map_id` | `task_maps` | **cascade** | Edges belong to the map. |
| `task_map_edges.source/target_node_id` | `task_map_nodes` | **cascade** | Edge dies with either endpoint. |

Archive columns (`is_archived` + `archived_at`) exist on `life_areas`, `goals`,
`habits`, and `task_maps`. Tasks, focus sessions, brain-dump items, daily
priorities, and map nodes/edges are hard-deletable because they are cheap and
their loss is intended.

## Constraints (data integrity, second layer after Zod)

- **Unique:** `user.email`, `session.token`; `habit_entries (habit_id, entry_date)`
  (one entry per habit per day, enables idempotent upsert); `daily_priorities
  (user_id, priority_date, position)` (one task per slot per day); `task_map_edges
  (task_map_id, source_node_id, target_node_id)` (no duplicate edges);
  `user_settings.user_id` (one settings row per user).
- **Check:**
  - `life_areas.weight > 0`
  - `goals.manual_progress` null or 0..100
  - `goals.parent_goal_id` null or `<> id` (no self-parenting)
  - `goal_progress_updates.progress` 0..100
  - `tasks.estimate_minutes` null or `> 0`
  - `habits`: numeric habits require a `target_value`
  - `habit_entries.value` null or `>= 0`
  - `focus_sessions.duration_seconds` null or `>= 0`; `focus_sessions.paused_seconds >= 0`
  - `daily_priorities.position` between 1 and 3; row must have a `task_id` or a `label`
  - `task_map_edges.source_node_id <> target_node_id` (no self-loops)
  - `brain_dump_items`: `converted_type` and `converted_entity_id` are both null or both set
  - `user_settings.week_starts_on` between 0 and 6
  - `focus_sessions.planned_duration_seconds` null or 1..86400 (extensions add to
    this column and had no ceiling of their own)

## Concurrency invariants (migration 0011, audit R-08)

Rules the application already tried to keep by reading first and then writing,
which two requests arriving together can both pass. They are now enforced by the
database, so the loser of a race gets a constraint violation instead of a
duplicate. `lib/db-errors.ts` classifies those violations and the callers turn
them into ordinary answers rather than errors.

- `user_single_owner_uq`: a unique index on a constant expression, so `"user"`
  can hold exactly one row. Backs the single-owner hook in `lib/auth.ts`.
  Multi-user later is a `DROP INDEX` and nothing else, since every table is
  already user-scoped.
- `focus_sessions_one_active_per_user_uq`: partial unique on `(user_id) WHERE
  status = 'in_progress'`. At most one running session, so a double start cannot
  leave two open and double count. `startFocusSessionAction` answers a conflict
  with the session that won.
- `habit_schedules_one_active_per_habit_uq`: partial unique on `(habit_id) WHERE
  is_active`. "One active schedule per habit" was previously only a convention;
  `upsertHabitSchedule` is now a single `ON CONFLICT` statement against it.
- `daily_priorities_user_date_task_uq`: partial unique on `(user_id,
  priority_date, task_id) WHERE task_id is not null`. One task cannot occupy two
  of the day's three slots.

Deliberately NOT enforced in the database: goal hierarchy cycles beyond
self-parenting. `goals_no_self_parent` covers the one-step case; a deeper cycle
needs a recursive trigger, and the ancestor walk in the Goals action remains the
guard. Ownership equality between parent and child rows (audit R-13) is also
still application-enforced.

## Indexes (from real query patterns)

Every domain table is indexed by `user_id` (the universal scope). Composite and
targeted indexes back the actual views:

- `tasks`: `(user_id, status)`, `(user_id, scheduled_for)`, `(user_id, due_at)`,
  plus `goal_id` and `life_area_id` for link lookups. These serve the date-derived
  Today/Week/Month/Quarter/Year/Inbox/Done views and goal roll-ups.
- `goals`: `(user_id, status)`, `life_area_id`, `parent_goal_id` (hierarchy walk).
- `habit_entries`: `(user_id, entry_date)` for the Today snapshot; the unique
  `(habit_id, entry_date)` covers per-habit history.
- `focus_sessions`: `(user_id, session_date)` for daily focus totals.
- `daily_priorities`: `(user_id, priority_date)`.
- `life_areas` / `habits`: `(user_id, is_archived)` to list active items cheaply.
- `task_maps` / nodes / edges: by `user_id`, `task_map_id`, and `task_id`.
- Auth: `session.user_id`, `account.user_id`, `verification.identifier`.

## Timezone rules (Asia/Manila)

Centralized in `lib/date.ts` (CLAUDE.md section 6), with boundary tests in
`tests/date.test.ts`.

- Audit columns and `due_at` / `started_at` / `ended_at` are real instants
  (`timestamptz`).
- Business dates are `date` columns holding the **Manila local calendar date**.
  `habit_entries` and `focus_sessions` carry both a `date` and a `timestamptz`:
  a habit logged at 12:30 AM Manila belongs to that local date, not the earlier
  UTC date.
- Local dates are never derived by truncating a UTC timestamp. `toManilaDate`
  resolves the calendar date through the IANA zone; date -> instant conversion
  uses Manila's constant +08:00 offset (no DST since 1978), asserted by tests.
- Date-derived buckets (Today/Week/Month/Quarter/Year) are computed as half-open
  local-date ranges (`start <= date < endExclusive`) by `manilaBucketRange`, and
  compared directly against `date` columns. There is no stored `bucket` field.

## Data-access seam (`db/`)

The UI never imports Drizzle directly (CLAUDE.md section 4). Everything goes
through `db/`:

- `db/client.ts` — the lazy, `server-only` Neon/Drizzle client. Reads
  `DATABASE_URL` on first use; constructing it opens no connection.
- `db/schema/*` — one file per domain area; `db/schema/index.ts` is the barrel
  Drizzle Kit reads.
- `db/types.ts` — inferred row/insert types, safe to import from client code
  (types are erased at build).
- `db/repositories/*` — user-scoped functions, one namespace per entity. Import
  as `import { tasksRepo, type Task } from "@/db"`.

Progress is derived, not duplicated: the repository returns per-goal task counts
and the pure `calculateGoalProgress` (`lib/goal-progress.ts`) computes the
percentage. In `auto` mode it is done / (total − cancelled) tasks (cancelled
excluded, zero countable = 0%); in `manual` mode it is `manual_progress`; a
`completed` goal is always 100%. Meaningful changes are journaled in
`goal_progress_updates` on intentional edits only, never on render.

## Migrations

- Generated SQL lives in `db/migrations/` and is tracked in git.
- Initial migration: `0000_init_full_schema.sql` (18 tables, all enums, FKs,
  checks, uniques, indexes).
- Scripts: `pnpm db:generate` (diff schema to SQL, offline), `pnpm db:migrate`
  (apply, needs `DATABASE_URL`), `pnpm db:push` (dev sync), `pnpm db:studio`.
- Never edit generated SQL by hand or reset destructively as a normal workflow
  (CLAUDE.md section 8).
- `0012_mysterious_hannibal_king.sql` is the automation foundation (Guide 00,
  phase A): `automation_tokens`, `automation_requests`, `notification_log`,
  `daily_quotes`, the six `user_settings` columns, and two partial indexes on
  `tasks`. Purely additive, nothing existing is touched. **Not applied.**
- `0011_silky_hardball.sql` (the concurrency invariants above) is generated and
  committed but **not applied**. It creates unique indexes over existing rows,
  so it fails rather than corrupts if the data already breaks a rule. Check
  first, then apply with `pnpm db:migrate`:

  ```sql
  -- Each of these must return no rows before the migration will succeed.
  SELECT count(*) FROM "user" HAVING count(*) > 1;
  SELECT user_id FROM focus_sessions WHERE status = 'in_progress'
    GROUP BY user_id HAVING count(*) > 1;
  SELECT habit_id FROM habit_schedules WHERE is_active
    GROUP BY habit_id HAVING count(*) > 1;
  SELECT user_id, priority_date, task_id FROM daily_priorities
    WHERE task_id IS NOT NULL
    GROUP BY user_id, priority_date, task_id HAVING count(*) > 1;
  SELECT id FROM focus_sessions
    WHERE planned_duration_seconds IS NOT NULL
      AND (planned_duration_seconds <= 0 OR planned_duration_seconds > 86400);
  ```
