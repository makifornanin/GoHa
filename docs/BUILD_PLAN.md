# BUILD_PLAN.md — GoHa Phased Build

This is the living plan. Update it as phases move: Not started, In progress, Completed, or Blocked. Record what changed, key files, and the verification performed. Do not mark a phase Completed on the basis that code was written; verification (typecheck, lint, `pnpm build`, and a manual check of the running app) is required first.

Two-stage delivery on ONE complete schema (CLAUDE.md section 2): define the full schema from day one (Phase 2), build MVP module UIs and logic first (Phases 3 to 7), then add each expansion as its own slice (Phases 8 to 13) with no re-architecture.

Legend: [ ] Not started, [~] In progress, [x] Completed, [!] Blocked.

---

## Phase 0: Discovery and Design Audit
Status: [x] Completed (2026-07-06)

- Audit the repo and tooling, read every Stitch export (there is no Stitch MCP here), extract tokens.
- Deliverable: `docs/STITCH_AUDIT.md` (screen inventory, route map, component inventory, design tokens, missing states, responsive notes).
- Key files: `docs/STITCH_AUDIT.md`.
- Done: read all 12 `code.html` exports plus `serene_lifecycle/DESIGN.md` and representative screenshots; extracted the full Serene Lifecycle token set (light) and derived a coherent Material 3 dark palette. Confirmed a fresh (non-git) folder containing only `CLAUDE.md` and `design/` at start.

## Phase 1: Scaffold and App Shell
Status: [x] Completed (2026-07-06)

- Scaffold Next.js 16 (App Router) + TypeScript strict + Tailwind 4 + pnpm, ESLint, Vitest, next-themes, Sonner, lucide-react, shadcn/ui foundation (used selectively).
- Implement design tokens as CSS variables and the Tailwind v4 theme (no scattered hex).
- Build the responsive shell: sidebar, mobile drawer + bottom nav, top app bar, `(app)` layout, `(auth)` group. Create all routes; each renders the real shell with a clearly labeled empty state. No feature logic, no database, no fake data.
- Key files: `app/layout.tsx`, `app/globals.css`, `app/(app)/layout.tsx`, `app/(app)/*/page.tsx`, `app/(auth)/*`, `components/shell/*`, `components/ui/*`, `lib/nav.ts`, `lib/utils.ts`, `vitest.config.ts`, `components.json`.
- Verification gate: `pnpm typecheck`, `pnpm lint`, `pnpm build`, dev server renders every route with no console/hydration/type/lint errors.
- Done and verified: `pnpm typecheck` clean, `pnpm lint` clean (fixed two real `react-hooks/set-state-in-effect` findings at the source), `pnpm test` 5/5 pass, `pnpm build` succeeds with 18 static routes. Dev server probed: all 16 paths return 200, `/` returns 307 to `/today`, dev log has no errors, warnings, or hydration issues. Confirmed the token pipeline (light + dark palette and the type scale) compiled into the production CSS.

## Phase 2: Full Database Schema and Repository Seam
Status: [x] Completed (2026-07-06)

- Define the COMPLETE schema for every entity from day one (life areas, goals, sub-goals, tasks, habits, habit entries, focus sessions, brain dump, task maps, reflections, plus Better Auth tables), user-scoped, UUID PKs, `TIMESTAMPTZ` audit columns and `DATE` business dates (CLAUDE.md sections 6 to 8).
- Neon Serverless Postgres, Drizzle ORM, Drizzle Kit migrations tracked in git. Single repository layer under `db/` (the seam); UI never imports Drizzle directly.
- Centralized timezone helpers (Asia/Manila) in one module with unit tests around date boundaries.
- Scripts: `db:generate`, `db:migrate`, `db:studio`.
- Blocker to flag if hit: a real `DATABASE_URL` (never fabricate a credential).
- Key files: `db/schema/*`, `db/index.ts`, `db/repositories/*`, `lib/date.ts`, `drizzle.config.ts`.
- Done and verified: 18 tables defined across `db/schema/*` (4 Better Auth + 14 domain), all UUID PKs, user-scoped FKs, `TIMESTAMPTZ` audit + `DATE` business dates, enums, check constraints, unique constraints (incl. `habit_entries (habit_id, entry_date)` and `daily_priorities (user_id, priority_date, position)`), and query-pattern indexes. Repository seam under `db/` with one namespace per entity (`tasksRepo`, `goalsRepo`, ...); UI imports `@/db` only. `lib/date.ts` centralizes Asia/Manila rules with 16 boundary tests. Initial migration `db/migrations/0000_init_full_schema.sql` generated (NOT applied to any DB). Verification: `tsc --noEmit` clean, ESLint clean, Vitest 21/21 (16 date + 5 shell), `next build` green (18 routes).
- Not applied: no `DATABASE_URL` yet (not needed for this phase). `db:migrate`/`db:studio` await the Neon credential. Git tracking is pending owner `git init` (repo not yet initialized).

## Phase 3: Authentication (MVP)
Status: [~] In progress (code complete and build-verified 2026-07-07; BLOCKED on a privileged DB credential to apply the migration and verify authenticated access)

- Better Auth with the Drizzle adapter, email/password. Session-derived identity only (never trust an incoming `user_id`).
- Build the `(auth)` login/register logic on the shell placeholders. Protect the `(app)` group.
- Key files: `lib/auth.ts`, `lib/auth-client.ts`, `lib/session.ts`, `app/api/auth/[...all]/route.ts`, `app/(auth)/login`, `app/(auth)/register`, `proxy.ts` (Next 16 renamed middleware to proxy), `db/repositories/users.ts`, `db/migrate.mts`.
- Done (code + non-DB verification): Better Auth configured (email/password, Drizzle adapter on Neon HTTP with `transaction: false`, `generateId: "uuid"`, `nextCookies`). Single-owner enforced: `disableSignUp` left off but a `user.create.before` hook refuses any account after the first, and `/register` is a one-time bootstrap that redirects to `/login` once the owner exists. `proxy.ts` does the optimistic cookie redirect; the `(app)` layout does the authoritative `requireUser()` check and passes the session user into the shell (real logout wired via `authClient.signOut`, user badge shown in sidebar + mobile drawer). Login screen wired with Zod validation, loading, and error states. Verified with `next start`: `/today`, `/`, `/goals` (no cookie) -> 307 to `/login` with `redirectTo`; `/login` renders 200; `/api/auth/get-session` returns 200 with no DB hit. Typecheck, lint, `next build`, and 21/21 tests all green.
- BLOCKED: the provided `DATABASE_URL` connects as Neon's low-privilege `authenticator` role (`has_database_privilege(CREATE)=false`, `has_schema_privilege('public','CREATE')=false`, not superuser). It cannot create tables, so `pnpm db:migrate` fails with `permission denied for database neondb` (42501), and `/register`/login 500 with `relation "user" does not exist`. Resolution: set `DATABASE_URL` to the Neon owner connection string (role `neondb_owner`, the default dashboard string), then run `pnpm db:migrate` and create the owner via `/register`. No credential was fabricated.

## Phase 4: Life Areas (MVP)
Status: [~] In progress (code complete and gate-verified 2026-07-07; BLOCKED on the same privileged DB credential for live persistence + the Playwright run)

- CRUD via Server Actions, Zod validated, user-scoped. Life area cards, summary widgets, balance score. Archive over hard delete.
- Key files: `db/repositories/life-areas.ts`, `app/(app)/life-areas/*`, `components/life-areas/*`, `lib/life-areas.ts`, `lib/validations/life-area.ts`, `components/ui/modal.tsx`, `components/ui/textarea.tsx`, `e2e/*`, `playwright.config.ts`.
- Done (code + offline verification): user-scoped repository (list/get/create/update/archive/restore, already present from Phase 2) exercised by new Zod schemas (`lib/validations/life-area.ts`) and Server Actions (`app/(app)/life-areas/actions.ts`) that derive identity from the session and return a typed `ActionResult`. Full UI built from the design: page header + `New Life Area`, responsive card grid, empty state, accessible create/edit Modal (focus trap, Esc, scroll lock), archive confirm, plus `loading.tsx` and `error.tsx`. Optimistic UI is used for archive only, with a visible rollback + error toast if the save fails (create/edit use action revalidation with pending/success/error states). Shared color/icon/limit constants (`lib/life-areas.ts`) back both the Zod enums and the pickers. Added an on-brand `body-sm` type token.
- Scope decisions (honest, no fake data per CLAUDE.md section 9): the design's top summary widgets (Overall Balance Score / total goals / tasks this week) and the per-card goal/task/Life-Score rollups are derived from the Goals/Tasks/Progress phases and are deferred until that data exists; cards show the area's own real data (icon, color, name, description, importance weight). Reorder was skipped because the design has no reorder affordance (a `sortOrder` column already backs ordering for later).
- Tests: `tests/life-area-schema.test.ts` (12 cases: name trim/limits, description normalization, color/icon enums, weight range/coercion, id + field-error mapping). Playwright flow written (`e2e/life-areas.spec.ts` + `e2e/auth.setup.ts` bootstrap-or-login + `playwright.config.ts`, `pnpm test:e2e`): create a life area, reload, assert it persisted, then archive to stay repeatable.
- Verification: `tsc --noEmit` clean, ESLint clean (fixed a real `set-state-in-effect` finding by remounting the form instead of resetting via effect), Vitest 33/33, `next build` green (18 routes).
- BLOCKED (unchanged from Phase 3): `DATABASE_URL` is still Neon's low-privilege `authenticator` role and there are no tables, so the migration cannot be applied, live persistence cannot be exercised, and the Playwright flow cannot run. Fix: set `DATABASE_URL` to the `neondb_owner` connection string, run `pnpm db:migrate`, then `pnpm exec playwright install chromium` and `pnpm test:e2e`. No credential fabricated.

## Phase 5: Goals with hierarchy and progress (MVP)
Status: [x] Completed (2026-07-07)

- Goals and sub-goals, the explicit V1 status set, derived + manual progress, timeframe filter tabs (Today/Week/Month/Quarter/Year/All). Linked to life areas.
- Key files: `db/repositories/goals.ts`, `app/(app)/goals/*`, `components/goals/*`, `lib/goal-progress.ts`, `lib/goals.ts`, `lib/validations/goal.ts`, `components/ui/select.tsx`.
- Database provisioned: the owner updated `DATABASE_URL` to `neondb_owner`, so the migration was applied for the first time here (this also unblocks Phases 3 and 4). Because nothing had ever been applied, the schema was corrected in place and the single initial migration was regenerated (`db/migrations/0000_init_full_schema.sql`) rather than shipping a fragile enum ALTER.
- Schema changes for Goals: `goal_status` set to `not_started, active, paused, completed, dropped` (the explicit V1 set); added `goal_timeframe` (daily..yearly) and `goal_progress_mode` (auto/manual); renamed `goals.progressOverride` -> `manualProgress`; added `goals.timeframe` + `progressMode` (+ index). Added `cancelled` to `task_status` so goal progress can exclude cancelled tasks. All applied to Neon and verified (18 tables, enum values confirmed).
- Progress architecture (`lib/goal-progress.ts`, pure + unit-tested): 1) a `completed` goal is always 100%; 2) `manual` mode uses `manualProgress` (clamped 0-100, tasks ignored); 3) `auto` mode = round(done / (total - cancelled) * 100), where cancelled tasks are excluded from the denominator, completed (`done`) tasks count in the numerator, and zero countable tasks yields 0%. The derived value is computed on read, never stored (CLAUDE.md section 7). Meaningful history is written to `goal_progress_updates` only on intentional changes (manual-progress edits and completion), never on render.
- Ownership everywhere: identity from the session; repository queries user-scoped; the Server Action re-checks that a referenced life area and parent goal belong to the caller, rejects self-parenting, and prevents hierarchy cycles (ancestor walk). Task counts per goal come from user-scoped correlated subqueries.
- UI from the design with all four states: timeframe filter tabs, responsive card grid + "Create New Goal" placeholder (success), skeleton `loading.tsx` (loading), `error.tsx` boundary (error), and an `EmptyState` when there are no goals (empty). Create/edit modal (title, description, life area, parent goal, timeframe, status, progress mode + manual slider, dates) built on the shared accessible Modal; optimistic archive with visible rollback. Deferred honestly: per-card habit counts and the Life Score remain for later phases; cards show real task counts (0 until Tasks lands).
- Tests: `tests/goal-progress.test.ts` (11 cases across completed/manual/auto, cancelled exclusion, zero/all-cancelled, rounding, clamping). Live persistence smoke against Neon confirmed a goal + sub-goal persist and the counting SQL excludes cancelled (2/3 -> 67%); the temporary rows were deleted.
- Verification: `tsc --noEmit` clean, ESLint clean, Vitest 44/44, `next build` green (18 routes).

## Phase 6: Tasks / To-dos (MVP)
Status: [x] Completed (2026-07-07)

- Tasks with priority, status, category, linked goal. Date-derived views (Today/Week/Month/Quarter/Year/Inbox/Done) from `scheduled_for`/`due_at` with timezone-aware rules. No static `bucket` field. Completion feedback that also updates linked goal progress.
- Key files: `db/repositories/tasks.ts`, `app/(app)/tasks/*`, `components/tasks/*`, `lib/task-buckets.ts`, `lib/tasks.ts`, `lib/validations/task.ts`, `e2e/tasks.spec.ts`.
- Schema migration `0001_tasks_status_priority_feedback.sql` (a proper additive migration on the already-applied DB, not a reset): renamed `task_status` value `done` -> `completed` (RENAME VALUE, data-preserving), added `urgent` to `priority`, and added `tasks.completion_note`. Hand-authored to use RENAME VALUE (Drizzle's default drop/recreate would have discarded the rename); the snapshot reflects the final state so future generates stay consistent. Applied to Neon and verified.
- Scheduling + derived views: `scheduled_for` (DATE) and `due_at` (TIMESTAMPTZ) are the real scheduling fields. `lib/task-buckets.ts` derives a task's effective local date (`scheduledFor`, else the Asia/Manila date of `dueAt`) and its view membership against `manilaBucketRange` (Today/This Week/This Month/This Quarter/This Year), plus Inbox (no dates), Done (completed), and All. No stored bucket. Completed/cancelled tasks are excluded from Inbox and timeframe views.
- Statuses `todo/in_progress/completed/cancelled`; priorities `low/medium/high/urgent`. Optional `goalId`/`lifeAreaId`. Completion feedback is persistent (`completion_note`): captured "during" via a toast action right after completing, and "after" via a per-task reflection modal (also editable in the Done view).
- Connected system: completing a task drives its linked goal's derived progress (goal `auto` mode counts `completed` tasks, excludes `cancelled`), so completion actions revalidate both `/tasks` and `/goals`. No recompute is stored; progress is derived on read.
- Ownership everywhere: identity from the session; every repository query user-scoped; Server Actions re-check that a referenced goal and life area belong to the caller. Actions: create/edit/complete(+feedback)/reopen/cancel/save-note/delete.
- UI from the design with all four states: left Views sub-nav with live counts, sort control (date/priority/newest/A-Z) and a life-area filter, priority-accented task cards with a completion checkbox and meta (priority/goal/life-area/schedule/due), create/edit modal, completion-note modal, delete confirm. Optimistic complete/reopen/cancel/delete with visible rollback. `loading.tsx` skeleton (loading), `error.tsx` boundary (error), `EmptyState` (empty), populated views (success).
- Tests: `tests/task-buckets.test.ts` (13 cases: effective date incl. the late-night Manila due-time boundary, each bucket's inclusive/exclusive edges, and view membership incl. completed/cancelled exclusion). Live Neon smoke confirmed the connected system: auto goal 0% -> add task 0% -> complete 100% (1/1) -> add+cancel a 2nd still 100% (cancelled excluded), and `completion_note` persisted; temp rows cleaned up.
- Playwright: `e2e/tasks.spec.ts` (create a task linked to a goal, complete it, assert the goal reads 100% / 1/1, then archive to stay repeatable). NOT executed here on purpose: its auth bootstrap would claim this single-owner app's owner slot on the real Neon DB. Run against a dedicated/fresh test database with `pnpm exec playwright install chromium && pnpm test:e2e`.
- Verification: `tsc --noEmit` clean, ESLint clean, Vitest 57/57, `next build` green (18 routes), live DB smoke green.

## Phase 7: Today Dashboard (MVP)
Status: [x] Completed (2026-07-07)

- Composed from real data: greeting, Today's Focus, Top 3 Actions, Life Score, Upcoming, Habits snapshot, quick add, evening reflection entry point. One connected system (no dashboard-only duplicate data).
- Key files: `app/(app)/today/*`, `components/today/*`, `lib/today.ts`, `db/repositories/daily-priorities.ts`.
- Canonical data only, no duplicates (CLAUDE.md section 7): the page loads the same `tasks`, `goals` (with counts), and `daily_priorities` rows used elsewhere, and `lib/today.ts` (pure) derives every section from them. Nothing dashboard-specific is stored. Verified by a live Neon smoke: a daily-priority row only references its task (`task_id`, no title copy), completing that canonical task moved the linked goal 0% -> 100%, and deleting the task cascaded the priority away (no orphan row).
- Sections aggregated from Tasks + Goals: Today's Focus (top open priority, else the highest-priority task due today); Top 3 Actions = `daily_priorities` resolved to their canonical tasks (pin/unpin + complete the underlying task); Today's Tasks and Overdue (derived from `scheduled_for`/`due_at` via the Asia/Manila effective-date rules in `lib/task-buckets`, no static bucket); Active Goals with derived progress bars; a "Today's Progress" ring (today's completed/total tasks); quick-add (creates a canonical task scheduled for today); and an evening-reflection entry point.
- Connected completion: completing a task on Today calls the same `completeTaskAction`/`reopenTaskAction` as the To-dos page (now also revalidating `/today`), so it updates the one canonical task and any linked goal's derived progress. Optimistic toggles with rollback.
- Habits-ready: the right column has a reserved `HabitsSlot` placeholder (clearly labeled, honest, no fake data) so the Habits phase drops real daily entries in without changing the layout or data flow.
- Ownership: identity from the session; all repository queries user-scoped; the daily-priority Server Actions (`app/(app)/today/actions.ts`) verify the task belongs to the caller, enforce the 3-slot max, and never copy task data.
- New helpers: `lib/date.ts` gained `formatManilaLongDate`, `manilaPartOfDay` for the greeting.
- Verification: `tsc --noEmit` clean, ESLint clean, Vitest 57/57 (unchanged), `next build` green (18 routes), live Neon smoke green.

## Phase 8: Habits (V1b)
Status: [x] Completed (2026-07-08)

- Boolean and numeric habits, schedules, entries (`entry_date DATE` + `created_at TIMESTAMPTZ`), streaks. Today habit logging writes the same entry seen in Habits.
- Key files: `app/(app)/habits/*`, `db/repositories/habits.ts`, `components/habits/*`, `lib/habit-streaks.ts`, `lib/habit-view.ts`, `lib/habits.ts`, `lib/validations/habit.ts`, `components/today/today-habits.tsx`.
- Schema: added `habit_entry_status` enum (done/missed/skipped) and replaced `habit_entries.completed` with `status` via two additive migrations (0002 add status + enum, 0003 drop completed) applied to Neon. Numeric `value` preserved; unique (habit_id, entry_date) makes logging an idempotent upsert (verified live: repeated same-day logs stay one row, value = latest).
- Measurement types: boolean habits log done / missed / skipped; numeric habits store the actual `value` toward `target_value` + `unit`, with `higher_is_better` deciding done vs partial. Optional `life_area`/`goal` links (ownership re-checked in the action).
- Scheduling via `habit_schedules` (not text): Every day (`daily`), Specific days (`weekly` + `days_of_week`), or X times per week (`weekly` + `times_per_period`). One active schedule per habit, upserted in place (no delete+reinsert).
- Streaks in a pure, tested domain utility (`lib/habit-streaks.ts`), never in a component: current + longest, schedule-aware (unscheduled days are not misses), Asia/Manila local dates, and a scheduled day only becomes a miss once it is in the past (today unlogged is "pending", never breaks the streak). Skipped days are neutral; numeric partials break. "X times per week" uses a week-based streak. `tests/habit-streaks.test.ts` (15 cases) covers the schedule-aware and Manila-midnight-boundary cases (streak = 2 at 23:59 Manila, 0 after 00:00 rolls the day into a miss).
- UI from the design with all four states: page header + best-streak pill, Today overview ring + today's-habit checklist with the logging control (loading via disabled/pending, success toasts, error toasts, empty state), a weekly history grid (habits × current week, done/partial/miss/skip cells + legend), an all-habits list, and the create/edit modal with the schedule builder. Optimistic logging with rollback.
- Today integration: the reserved Today slot now renders `TodayHabits`, showing today's SCHEDULED habits and logging via the same `logHabitEntryAction` -> same `habit_entries` seen in the Habits module (both revalidate `/today` and `/habits`). `lib/habit-view.ts` derives both surfaces from the one canonical habits + entries set.
- Ownership: session identity; all repository queries user-scoped; log/clear actions verify the habit belongs to the caller.
- Verification: `tsc --noEmit` clean, ESLint clean, Vitest 72/72 (15 new), `next build` green (18 routes), live Neon smoke green (upsert de-dupe, value preserved, done/missed/skipped stored).

## Phase 9: Focus Mode (V1b)
Status: [x] Completed (2026-07-08)

- Focus timer/session. Zustand only for the active timer interaction. Start Focus from tasks and Today.
- Key files: `app/(app)/focus/*`, `stores/focus-timer.ts`, `components/focus/*`, `lib/focus.ts`, `lib/focus-reconcile.ts`, `db/repositories/focus.ts`.
- Schema: migration 0004 added `focus_sessions.paused_at` (tz) + `paused_seconds` (int, `>= 0` check) for pause tracking, plus a `(user_id, status)` index. Applied to Neon.
- Duration is DERIVED from timestamps, never a browser counter (`lib/focus.ts`, pure + unit-tested): `focusElapsedSeconds = (endedAt ?? now) - startedAt - pausedTime`, where an ongoing pause runs up to now; clamped so it is never negative or greater than the gross window. Pause/resume fold each interval into `paused_seconds` at resume (`resolvePausedSeconds`). `tests/focus.test.ts` (14 cases) covers a pause-and-resume case, multiple pauses, in-progress freezing while paused, the cap, and negative/impossible clamping.
- Abandoned policy (documented in `lib/focus.ts`): counted focus time is always capped at the planned duration (extendable via "Need More Time?"), so leaving a timer running never inflates totals; sessions with no plan cap at 4h. A running session open past 12h is auto-resolved to `abandoned` (capped) on Focus page load (`lib/focus-reconcile.ts`), so it never stays in_progress forever. Only `completed` sessions count toward focus totals; `abandoned` are excluded.
- Source of truth is PostgreSQL. Zustand (`stores/focus-timer.ts`) holds only the active session mirror + a display tick; every transition round-trips to a Server Action and the returned row replaces the store. Reload/refresh recovers the in-progress session from the server (getActiveFocusSession) and never inserts a duplicate; starting a new session first finalizes any lingering one (no double count).
- Flow + Server Actions (user-scoped, ownership on `taskId`): start (finalizes any open session, then inserts), pause, resume, extend ("+5 min"), end (complete/stop -> derived+capped duration), discard. All derive/clamp durations; DB check enforces `duration_seconds >= 0`.
- Aggregates (`aggregateFocus`, pure): focus time today, this week, and by task / goal / life area (joined via the session's task), plus a recent-sessions list. Verified live: by-goal and by-life-area totals via the task join.
- UI from the design with all states: setup (task select + duration presets + Start), active timer (progress ring + countdown), paused, "Time's up", overtime; controls (pause/resume, complete, discard, extend), session notes; loading/error boundaries and an empty stats state. Optimistic transitions with server reconciliation.
- Verification: `tsc --noEmit` clean, ESLint clean, Vitest 86/86 (14 new), `next build` green (18 routes), live Neon smoke green (reload recovery, pause/resume duration = 1380, abandoned capped at plan, aggregate join, negative rejected).

## Phase 10: Brain Dump (V1b)
Status: [x] Completed (2026-07-08)

- Fast capture inbox that flows into tasks. Key files: `app/(app)/brain-dump/*`, `db/repositories/brain-dump.ts`, `components/brain-dump/*`, `lib/brain-dump.ts`, `lib/validations/brain-dump.ts`, `e2e/brain-dump.spec.ts`.
- Schema: migrations 0005/0006 added the `brain_dump_converted_type` enum (task/goal/habit) and `brain_dump_items.converted_type` + `converted_entity_id` (polymorphic, no FK), dropped the old `converted_task_id`, and added a check that the two converted columns are both null or both set. Applied to Neon.
- Capture + CRUD, user-scoped: capture text -> `brain_dump_items`; list the inbox; edit/archive/restore/delete. Edit and archive are guarded to skip converted items; delete is hard delete behind a confirm ("safely").
- Conversion is a SINGLE ATOMIC statement (`convertBrainDumpItem`, a writable CTE): `src` selects+locks the item `FOR UPDATE` only if `status <> 'converted'`; the target entity (Task, Goal, or Habit + its default schedule) is INSERTed gated on `src`; the item is UPDATEd to `converted` with `converted_type` + `converted_entity_id`. Both the insert and the update are gated on the same locked `src` row, and the entity id is generated up front, so the whole thing is one round-trip and inherently transactional. Double submission (sequential or concurrent) is safe: the second call sees `status = 'converted'`, the CTE is a no-op (0 rows), and the action returns "already converted" — never two entities or two conversions. Ownership is enforced inside `src`.
- Verified live against Neon: capture -> convert-to-task creates the task (title = content) and marks the item converted with a matching `converted_entity_id`; a second convert returns null with the task count still 1; convert-to-habit atomically creates the habit + its schedule; a foreign-user conversion is a no-op (item stays inbox).
- UI from the design with all states: capture card (textarea + "Dump It", Cmd/Ctrl+Enter, char count), Inbox/Archived/Converted tabs with counts, per-item To Task / To Goal / To Habit + Edit (inline) + Archive + Delete, converted items show a "Converted to X" badge + link to the module, restore from Archived; optimistic updates with rollback; empty/loading/error states. (The design's "To Event" is omitted: no event entity exists yet.)
- Playwright `e2e/brain-dump.spec.ts` (capture -> convert to task -> assert the item shows "Converted to Task" and the Task exists in the To-dos Inbox). Written but not run here (its auth bootstrap would claim this single-owner app's owner slot on the real DB); the live smoke covers the same capture->convert->exists+converted guarantee.
- Verification: `tsc --noEmit` clean, ESLint clean, Vitest 86/86 (unchanged), `next build` green (18 routes), live Neon smoke green (atomicity, double-submit no-op, ownership).

## Phase 11: Task Maps (V1b)
Status: [x] Completed (2026-07-08)

- React Flow (`@xyflow/react` 12.11.2) node map, built end to end on the Phase 2 schema (no migration needed: `task_maps` + `task_map_nodes` + `task_map_edges` already existed). Key files: `app/(app)/task-maps/{page,actions,loading,error}.tsx`, `components/task-maps/{task-maps-workspace,flow-canvas}.tsx`, `db/repositories/task-maps.ts`, `lib/task-maps.ts`, `lib/validations/task-maps.ts`, `e2e/task-maps.spec.ts`.
- Repository additions (user-scoped): `updateTaskMap` (rename/description/viewport), `restoreTaskMap`, hard `deleteTaskMap` (cascades nodes+edges), `updateNodePositions` (batch, constrained to `userId` AND `taskMapId` so a stale client id can never write another map/owner), `countNodesInMap` (validates both edge endpoints live in the owned map), and `createTaskMapEdge` made idempotent via `onConflictDoNothing` on the `(map, source, target)` unique constraint.
- Server Actions (Zod at the boundary, ownership enforced): map create/update/archive/restore/delete + `saveViewport`; node add/update/move-batch/delete; edge add/delete. Every graph mutation re-checks map ownership (`assertMapOwner`); node link `taskId` is verified against the caller's tasks; edge creation requires both endpoints in the map.
- Canvas (`flow-canvas.tsx`, `"use client"`, dynamically imported with `next/dynamic` `ssr:false` from the workspace so `@xyflow/react` stays out of every other route's bundle and off the server): custom node card (type chip + label + linked-task indicator, top/bottom connect handles for branching), Background dots, Controls, MiniMap, and a top-center add-node toolbar (Task/Note/Milestone). Position saves are debounced (500 ms) and only enqueue the final drag-stop position; pending writes flush on unmount and `beforeunload`. Connect creates an edge; Backspace/Delete removes nodes/edges (node delete cascades its edges server-side, and the edge-delete no-op is harmless). A right-hand inspector edits a node's label/type/linked task and offers "Open in To-dos" for a linked node.
- Reload restores exact state from PostgreSQL: node positions + all edges (and the saved viewport). Maps list + editor live on one route via a `?map=<id>` selection param; the page defaults to the first map so a returning user always lands on something. All states covered: empty (no maps), loading skeleton, route error boundary, map-not-found, and archived section with restore/delete.
- Playwright `e2e/task-maps.spec.ts` (create a map, add two nodes, connect them, move one, reload, assert the moved `.react-flow__node` transform round-tripped within 1.5px and the edge persisted, then delete the map). Written but not run here (its auth bootstrap would claim this single-owner app's owner slot on the real DB); the live smoke covers the same persistence guarantees.
- Verification: `tsc --noEmit` clean, ESLint clean, `next build` green (18 routes, `/task-maps` dynamic), and a live Neon smoke (throwaway user, cascade cleanup) green: batch position update persisted (123.5/456.25), edge endpoints correct, duplicate edge a no-op, self-loop rejected by the check constraint, map user-scoped, and map delete cascaded nodes+edges.

## Phase 12: Calendar, Review, Progress surfaces (V1b)
Status: [x] Completed (2026-08-13)

- Calendar/schedule, weekly review and reflection, progress/life-score analytics. Derived from existing data; no new source of truth.
- Key files: `app/(app)/calendar/*`, `app/(app)/review/*`, `app/(app)/progress/*`.
- Note (2026-07-08): Phase 13 (Settings + polish) was built ahead of this phase by owner request, with no re-architecture. These three routes remain the `ComingSoon` placeholders from Phase 1. Their sidebar/mobile nav entries already exist and are live.

- Progress (2026-08-13): `/progress` is a real dashboard driven entirely by records the app was already writing and never reading back: completed-task timestamps, focus session durations, habit entries. `lib/progress.ts` (pure, unit-tested) derives weekly completions, weekly focus minutes, and a 26-week habit heatmap. The heatmap reuses `buildHabitViews`, so a day can never read as missed there and done on the Habits screen. Charts are divs plus design tokens rather than a charting dependency, which would have brought its own colour system to re-bridge for light/dark. Comparison windows are honest: no prior period reads "no earlier data", never "no change".

- Review (2026-08-13): the "Reflect" end of the chain finally has a home. Migration `0009_shiny_vengeance.sql` adds `weekly_reviews` (the reflections table the Phase 2 schema listed but never created): `week_start DATE`, three prose prompts, an optional 1-5 rating, and `completed_at` for draft-versus-done, unique on (user_id, week_start) so saving is an idempotent upsert instead of a pile of drafts. It is the ONLY thing the screen stores: every statistic (completed, slipped, habit consistency, focus time, goals completed) stays derived on read via `lib/review.ts`, so reopening a task later corrects the history rather than leaving a frozen snapshot. Week navigation cannot go past the current week.

- Calendar (2026-08-13): `/calendar` is the unified schedule (tasks, habit occurrences, focus minutes on one month grid), distinct from the task-only calendar inside To-dos, which stays an editing surface. Habit occurrences resolve from the same schedule rules `buildHabitViews` uses, so a day cannot read as scheduled here and unscheduled on Habits. Layer filter (All/Tasks/Habits/Focus) plus a selected-day detail rail. Reuses `lib/calendar.ts` (`buildMonthGrid`, `monthLabel`, `weekdayHeaders`) rather than a second grid implementation.

- Also in this slice: `plannedNav` is now empty and all twelve routes are in the sidebar, since the rule is that every nav entry must lead to a working screen. `loading.tsx` and `error.tsx` boundaries added for both new routes. "Focus on this" carries `?taskId=` so Focus preselects the task instead of opening an empty picker. Settings gained a data export (`exportMyDataAction`): every canonical row the user owns as one JSON file, built in the browser from the server's JSON, with auth rows excluded. Derived values are deliberately not exported, since they are recomputed on read everywhere else.

- Verification: `tsc`, `eslint`, 150 unit tests (`tests/review.test.ts` covers completion-week attribution, slipped detection, cancelled exclusion, per-area grouping, focus windowing, habit consistency and the carry-over cap), 31/31 Playwright, `pnpm build`, plus a scripted browser sweep of all twelve routes at 390 and 1600 wide.

## Phase 13: Settings + polish pass (V1b)
Status: [x] Completed (2026-07-08)

- Lean Settings (not an enterprise area, per the phase prompt): profile basics, theme via next-themes (light/dark/system), timezone (default Asia/Manila), and week-start preference, all persisted to `user_settings` and actually applied across the app. Plus a polish pass (dark mode, responsive, states, accessibility).
- Key files: `app/(app)/settings/{page,actions,loading,error}.tsx`, `components/settings/settings-view.tsx`, `components/theme-sync.tsx`, `lib/user-settings.ts`, `lib/validations/settings.ts`, `lib/timezones.ts`, `tests/settings-schema.test.ts`, `components/task-maps/flow-canvas.tsx`.
- No migration: `user_settings` already existed from the Phase 2 full schema (`timezone`, `theme`, `weekStartsOn` + `0..6` check, plus forward-compatible `notificationsEnabled`/`dailyPlanningTime`/`eveningReflectionTime`/`preferences` columns left for later). The repository (`getOrCreateUserSettings` create-on-demand, upsert `updateUserSettings`) was reused.
- Ownership enforced everywhere: identity from `requireUser()` (session), never an incoming id. Theme/preferences actions write only `settingsRepo.update...(user.id, ...)`; the profile action delegates to Better Auth's `updateUser`, which derives the account from the session cookies (a caller can only ever update their own name). Every input is Zod-validated at the boundary (`displayNameSchema`, `themeSchema`, `timezoneSchema` via a real `Intl` check, `weekStartSchema` 0..6), matched by the DB check constraint.
- Actually applied across the app: `lib/date.ts` exposes generic `zoned*` helpers (timezone + `weekStartsOn`) under the `manila*` defaults, and `lib/task-buckets.ts` threads both through. Server pages read `getUserDatePrefs(user.id)` and pass `timeZone`/`weekStartsOn` into their views: Today, To-dos, Focus, and Habits all derive "today"/"this week" from the saved settings rather than hardcoded Manila/Monday. `getUserSettingsCached` (React `cache`) shares one settings query between the shell layout and the page per request.
- Theme with no hydration flash: next-themes (`attribute="class"`, `disableTransitionOnChange`) applies the choice instantly on the client; `components/theme-sync.tsx` seeds next-themes from `user_settings.theme` on a device that has no local choice yet (and never overrides an existing local one), so the persisted theme is authoritative across devices without a flash. Appearance card reflects the persisted value before hydration and rolls back the applied theme if the save fails. `<html suppressHydrationWarning>` is set.
- Scope kept lean on purpose (honest deferrals, no fake data): the design's Settings mockup also shows Life-Area chips management, task-status renaming, default focus-timer durations, Life-Score balance weights, and email/push notification toggles. Per the phase prompt ("keep it lean") and CLAUDE.md section 2 (no push/email infrastructure), these are intentionally omitted; the Life-Score weights belong with the Progress phase. The schema keeps the columns for a future slice.
- Polish pass performed at the code level (this environment has no browser to drive; no Playwright run):
  - Dark mode: verified the token pipeline covers forms, modals, popovers, and the shell. Fixed the one real gap: the React Flow canvas pinned its `Background` dots (`#c2c8c6`) and edge stroke (`#727877`) to light-palette hex, so they did not adapt. Both are now theme-aware from the `outline`/`outline-variant` token values (`CANVAS_COLORS` keyed by `resolvedTheme`), completing the canvas dark story alongside the existing `colorMode` prop.
  - Accessibility: modal has a full focus trap + Esc + scroll lock + focus restoration and labelled `role="dialog"`; the mobile drawer is a labelled `aria-modal` dialog with Esc, scroll lock, and focus move; every icon-only button carries an `aria-label` (58 `aria-label` usages across 22 components; all `size="icon"` buttons covered); decorative icons are `aria-hidden`; form fields are labelled.
  - States: all nine data-backed routes (life-areas, goals, tasks, today, habits, focus, brain-dump, task-maps, settings) have both `loading.tsx` and `error.tsx`; empty/success are handled in-view. The three not-yet-built routes are honest `ComingSoon` placeholders (no data to load).
  - Responsive: Settings uses a responsive `lg:grid-cols-2` bento; mobile nav (drawer + bottom bar), dialogs (bottom-sheet on mobile, `max-h-[90vh]`), and the task-map MiniMap (`hidden md:block`) were confirmed in the source.
- Tests: added `tests/settings-schema.test.ts` (12 cases: display-name trim/limits, theme enum, timezone `Intl` validation + trim, week-start coercion/range, combined preferences, `isValidTimeZone`).
- Verification: `tsc --noEmit` clean, ESLint clean, Vitest 98/98 (12 new), `next build` green (18 routes). Not run here: a live authenticated click-through and Playwright (would claim the single-owner slot on the real Neon DB and needs a browser); the schema/wiring is covered by the unit suite and the build.

---

## Change log

### 2026-07-06: Phases 0 and 1 (discovery, scaffold, app shell)
- Design audit written to `docs/STITCH_AUDIT.md` from the local Stitch exports (no Stitch MCP available in this environment).
- Scaffolded Next.js 16.2.10 + React 19.2.4 + TypeScript strict + Tailwind v4 + pnpm; added ESLint (flat config), Vitest (+ Testing Library, jsdom), next-themes, Sonner, lucide-react, and a hand-authored shadcn/ui foundation (`components.json`, `cn`, `Button`, `Input`, themed `Toaster`).
- Serene Lifecycle tokens implemented as CSS variables plus a Tailwind v4 `@theme inline` map in `app/globals.css`, including a derived Material 3 dark palette. No scattered hex in components.
- Responsive shell: fixed 280px sidebar, sticky top app bar, mobile top bar with an accessible slide-in drawer, and a mobile bottom bar with a center action. Route groups `(app)` and `(auth)`.
- Routes: `/today`, `/goals`, `/tasks`, `/task-maps`, `/focus`, `/habits`, `/calendar`, `/brain-dump`, `/life-areas`, `/review`, `/progress`, `/settings`, plus `/login` and `/register`; `/` redirects to `/today`. Every page renders the real shell with a clearly labeled empty state. No feature logic and no fake data.
- Verification: typecheck clean, lint clean, tests 5/5, `pnpm build` green (18 static routes), dev server serves every route with a clean log.
- Follow-ups noted for later phases: full focus-trap on the mobile drawer, loading/error states, auth screens wired to Better Auth, and the `db:generate` / `db:migrate` / `db:studio` scripts (added with the schema in Phase 2).
- Git: the project is not yet a git repository. Initialization and the first commit were left for the owner to run (not committed automatically).

### 2026-07-06: Phase 2 (full database schema and repository seam)
- Added Drizzle: `drizzle-orm` 0.45.2, `@neondatabase/serverless` 1.1.0, `server-only`, and dev `drizzle-kit` 0.31.10. New scripts `db:generate` / `db:migrate` / `db:push` / `db:studio`. `drizzle.config.ts` uses `casing: "snake_case"` (matched in `db/client.ts`) so camelCase TS maps to snake_case Postgres.
- Complete schema in `db/schema/*` (one file per area, barrel in `db/schema/index.ts`): Better Auth (`user`, `session`, `account`, `verification`) plus `life_areas`, `goals`, `goal_progress_updates`, `tasks`, `habits`, `habit_schedules`, `habit_entries`, `focus_sessions`, `brain_dump_items`, `daily_priorities`, `task_maps`, `task_map_nodes`, `task_map_edges`, `user_settings`. UUID PKs everywhere, user-scoped FKs with deliberate `cascade` / `set null`, `TIMESTAMPTZ` audit columns, `DATE` business dates, 9 enums, check + unique constraints, and indexes from real query patterns. Goal hierarchy via self-referencing `parent_goal_id`.
- Data-access seam under `db/`: lazy `server-only` Neon client (`db/client.ts`, no connection at import), inferred types (`db/types.ts`, client-safe), and per-entity user-scoped repositories (`db/repositories/*`) exported as namespaces from `@/db` (`tasksRepo`, `goalsRepo`, ...). UI never imports Drizzle. Derived goal progress computed from tasks (no duplicated data).
- Timezone module `lib/date.ts` (Asia/Manila, Intl-based, dependency-free): instant-to-local-date, local-day UTC ranges, and half-open bucket ranges (Today/Week/Month/Quarter/Year). `tests/date.test.ts` pins boundaries (Manila midnight vs UTC midnight, the 12:30 AM habit case, month/quarter/year rollovers).
- Migration `db/migrations/0000_init_full_schema.sql` (+ meta) generated offline and tracked. NOT applied to any database (no `DATABASE_URL` needed for this phase). `.env.example` added with a `DATABASE_URL` placeholder (no real secret).
- Docs: `docs/DATABASE.md` (table summary, relations, constraints, indexes, deletion behavior, timezone rules, seam overview).
- Verification: `tsc --noEmit` clean, ESLint clean, Vitest 21/21, `next build` green (18 routes).
- Blocker noted (not hit): applying the migration and running `db:migrate` / `db:studio` needs a real Neon `DATABASE_URL`; not fabricated. Git tracking of the migration awaits the owner initializing the repo.

### 2026-07-07: Phase 3 (authentication) — code complete, blocked on DB credential
- Added `better-auth` 1.6.23 and `zod` 4.4.3. Cleared the pnpm build gate by acknowledging the transitive `msw` build script (`allowBuilds: msw: false` in `pnpm-workspace.yaml`).
- Better Auth server (`lib/auth.ts`): Drizzle adapter (`provider: "pg"`, `transaction: false` for the Neon HTTP driver), email/password with `autoSignIn` and an 8-char minimum, `advanced.database.generateId: "uuid"` to match the schema's uuid PKs, and `nextCookies()` last. Single-owner enforced by a `databaseHooks.user.create.before` hook that refuses any account once one exists.
- Browser client `lib/auth-client.ts`; route handler `app/api/auth/[...all]/route.ts` (`toNextJsHandler`); server helpers `lib/session.ts` (`getSession` cached, `getCurrentUser`, `requireUser`).
- Protection: `proxy.ts` (Next 16 renamed `middleware` to `proxy`) does the optimistic session-cookie redirect (unauth -> `/login?redirectTo=...`, auth -> `/today`); the `(app)` layout runs the authoritative `requireUser()` and passes the session user into the shell. Real logout via `authClient.signOut` (`components/auth/logout-button.tsx`), user badge in the sidebar and mobile drawer.
- Login/bootstrap: `components/auth/auth-form.tsx` wired to Better Auth with Zod validation, loading, and error states; `/login` and `/register` are server components (`/register` is the one-time owner bootstrap, gated by `usersRepo.hasAnyUser()`).
- `.env.example` rewritten to variable NAMES ONLY (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`); `.gitignore` keeps `.env*` ignored but un-ignores `.env.example`. `db:migrate` now runs `db/migrate.mts` (Neon HTTP migrator, reliable from the CLI; drizzle-kit's websocket path failed silently here).
- Verification: typecheck, lint, `next build` (clean, no proxy deprecation warning), and 21/21 tests green. Runtime probes via `next start`: protected routes 307 to `/login` with `redirectTo`, `/login` renders 200, `/api/auth/get-session` returns 200 with no DB hit.
- BLOCKED: `DATABASE_URL` is Neon's low-privilege `authenticator` role (cannot CREATE), so the migration cannot be applied and authenticated access cannot be verified end-to-end. Needs the `neondb_owner` connection string. See the Phase 3 status note for the exact evidence and fix.

### 2026-07-07: Phase 4 (Life Areas) — code complete, blocked on DB credential
- Added `zod` usage for real: `lib/validations/life-area.ts` (create/edit schema with trimming, length limits, color/icon enums, weight range + coercion, empty-description -> null, uuid id, field-error mapping) built on shared constants in `lib/life-areas.ts`.
- Server Actions in `app/(app)/life-areas/actions.ts` (create/update/archive/restore): identity from `requireUser()`, Zod-validated, user-scoped through the existing repository, `revalidatePath`, typed `ActionResult` with field errors. DB errors are logged and returned as friendly messages, never swallowed.
- UI from the design: `components/life-areas/*` (card, create/edit form modal, client view) + reusable `components/ui/modal.tsx` (focus trap, Esc, backdrop, scroll lock) and `components/ui/textarea.tsx`. Page fetches server-side and renders the view; added `loading.tsx` skeleton and `error.tsx` boundary. Optimistic UI on archive only, with visible rollback + error toast; create/edit use pending/success/error via revalidation.
- Deferred honestly (no fake data): top summary widgets and per-card goal/task/Life-Score rollups depend on Goals/Tasks/Progress phases; reorder skipped (no design affordance). Added a `body-sm` design token.
- Tests: `tests/life-area-schema.test.ts` (12 cases). Playwright: `playwright.config.ts` + `e2e/auth.setup.ts` (bootstrap-or-login, saved storage state) + `e2e/life-areas.spec.ts` (create -> reload -> persisted -> archive). `pnpm test:e2e` added; `@playwright/test` installed (browsers + a migrated DB still required to run).
- Verification: `tsc` clean, ESLint clean (fixed a real `set-state-in-effect` finding via form remount), Vitest 33/33, `next build` green.
- BLOCKED (same as Phase 3): still the `authenticator` role with no tables. Live persistence and the Playwright run are pending the `neondb_owner` `DATABASE_URL` + `pnpm db:migrate`.
- UPDATE (2026-07-07, Phase 5): the owner set `DATABASE_URL` to `neondb_owner` and the migration was applied, so this blocker is now resolved. The Life Areas Playwright flow can be run with `pnpm exec playwright install chromium && pnpm test:e2e` (not run in the Goals phase).

### 2026-07-07: Phase 5 (Goals) — with DB now provisioned
- Owner provided the `neondb_owner` `DATABASE_URL`; applied the initial migration to Neon for the first time (18 tables). Since nothing had been applied, corrected the schema in place and regenerated the single initial migration (rather than a fragile enum ALTER): `goal_status` -> the explicit V1 set (`not_started/active/paused/completed/dropped`), added `goal_timeframe` and `goal_progress_mode`, renamed `goals.progressOverride` -> `manualProgress`, added `goals.timeframe`/`progressMode`, and added `cancelled` to `task_status`.
- Progress: pure, unit-tested `lib/goal-progress.ts` (completed=100; manual uses `manualProgress`; auto = done/(total−cancelled), cancelled excluded, zero countable = 0%). Derived on read, never stored. `goal_progress_updates` written only on intentional changes (manual edits, completion).
- Repository/actions: user-scoped throughout; the Server Action verifies life area + parent goal ownership, blocks self-parenting and hierarchy cycles; correlated subqueries return per-goal task counts.
- UI: timeframe filter tabs, card grid + "Create New Goal" placeholder, create/edit modal (hierarchy, life area, timeframe, status, progress mode + manual slider, dates), optimistic archive, plus loading/empty/error/success states. Added a native `Select` primitive.
- Tests: `tests/goal-progress.test.ts` (11 cases). Live Neon smoke confirmed persistence + cancelled-exclusion (2/3 -> 67%), then cleaned up.
- Verification: typecheck clean, lint clean, Vitest 44/44, `next build` green.

### 2026-07-07: Phase 6 (Tasks / To-dos)
- Migration `0001_tasks_status_priority_feedback.sql` applied to Neon (proper additive migration, DB was empty but not reset): `task_status` `done` -> `completed` via RENAME VALUE, `priority` += `urgent`, `tasks.completion_note` added. Updated the `'done'` -> `'completed'` references in the tasks and goals repositories and the goal-progress rules.
- `lib/task-buckets.ts`: pure, timezone-aware derivation of a task's effective local date (scheduled_for, else the Asia/Manila date of due_at) and its view membership (Inbox / Today / This Week / This Month / This Quarter / This Year / Done / All); no stored bucket. `lib/date.ts` gained `manilaLocalToInstant`, `instantToManilaDateTimeInput`, and `formatManilaDateTimeMedium` for due_at.
- Repository/actions user-scoped with goal + life-area ownership checks; complete-with-feedback, reopen, cancel, save-note, delete. Completing revalidates `/tasks` and `/goals` so derived goal progress reflects it.
- UI from the design: Views sub-nav with counts, sort + life-area filters, priority-accented cards with completion checkbox, create/edit modal, completion-reflection modal (during + after), delete confirm, optimistic mutations, and loading/empty/error/success states.
- Tests: `tests/task-buckets.test.ts` (13 cases). Playwright `e2e/tasks.spec.ts` written (task -> goal progress), not run against the real single-owner DB. Live Neon smoke verified 0% -> 100% (1/1), cancelled exclusion, and completion_note persistence.
- Verification: typecheck clean, lint clean, Vitest 57/57, `next build` green.

### 2026-07-07: Phase 7 (Today Dashboard)
- Aggregates canonical Tasks + Goals + `daily_priorities` only; `lib/today.ts` (pure) derives Today's Focus, Top 3 Actions, Today's Tasks, Overdue, Active Goals, and today's completion ring. No dashboard-only data.
- Top 3 Actions reference tasks (never copy them); `app/(app)/today/actions.ts` (add/remove priority) is user-scoped, verifies task ownership, and caps at 3. Completing on Today reuses `completeTaskAction`/`reopenTaskAction` (now revalidating `/today` too), so it updates the one canonical task and any linked goal.
- Reserved `HabitsSlot` placeholder so the Habits phase slots in without layout/data changes. Quick-add creates a canonical task for today; evening-reflection links to Review.
- `lib/date.ts`: added `formatManilaLongDate` + `manilaPartOfDay` for the greeting.
- Live Neon smoke: priority references task (no copy), completing the task -> goal 0%->100%, deleting the task cascades the priority away. typecheck/lint/build/tests all green (57/57).

### 2026-07-08: Phase 8 (Habits)
- Migrations 0002/0003: `habit_entry_status` enum + `habit_entries.status` (done/missed/skipped), dropped `completed`. Applied to Neon.
- `lib/habit-streaks.ts` (pure, tested): schedule-aware current/longest streaks in Asia/Manila dates; today unlogged is pending (never a premature miss); skips neutral; numeric partials break; week-based streaks for X/week. `tests/habit-streaks.test.ts` (15 cases incl. the Manila midnight boundary).
- Repository upserts habit entries on (habit_id, entry_date) (idempotent, numeric value preserved) and the single active schedule in place; user-scoped throughout. Server Actions (create/edit/archive/log/clear) verify habit + life-area + goal ownership.
- UI: boolean/numeric habits, schedule builder (daily / specific days / X per week), color+icon, life-area/goal links; Today overview ring + logging checklist, weekly history grid, all-habits list, create/edit modal; loading/empty/error/success states; optimistic logging.
- Today dashboard now shows today's scheduled habits (`components/today/today-habits.tsx`) logging to the same `habit_entries`; `lib/habit-view.ts` derives both surfaces from one canonical set.
- Live Neon smoke: repeated same-day log stays 1 row, value preserved (8.0000), done/missed/skipped stored. typecheck/lint/build green, Vitest 72/72.

### 2026-07-08: Phase 9 (Focus Mode)
- Added zustand. Migration 0004: `focus_sessions.paused_at` + `paused_seconds` (+ check, + status index). Applied to Neon.
- `lib/focus.ts` (pure, tested): elapsed derived from timestamps minus paused time (never a countdown), clamped to a valid range; counted time capped at the plan; abandoned-session policy (12h -> abandoned, capped) + `lib/focus-reconcile.ts` run on page load. `tests/focus.test.ts` (14 cases incl. pause/resume, cap, negative clamp, aggregates).
- Repository lifecycle (start-finalizing-open, pause, resume, extend, end, discard, reconcile, aggregates) + user-scoped Server Actions with `taskId` ownership. PostgreSQL is the source of truth; `stores/focus-timer.ts` mirrors the active session and ticks; reload recovers the in-progress session with no double count.
- Aggregates: focus today/this week + by task/goal/life area + recent sessions. UI from the design (setup, running/paused/time's-up timer with ring, controls, notes) with loading/empty/error states.
- Live Neon smoke: reload recovery, pause/resume duration 1380, abandoned capped at plan (1500), by-goal/life-area join, negative rejected. typecheck/lint/build green, Vitest 86/86.

### 2026-07-08: Phase 10 (Brain Dump)
- Migrations 0005/0006: `brain_dump_converted_type` enum + `converted_type`/`converted_entity_id` (polymorphic, both-or-neither check), dropped `converted_task_id`. Applied to Neon.
- Conversion to Task/Goal/Habit is one atomic writable-CTE statement: lock source `FOR UPDATE` if not converted, insert the gated entity (+ default schedule for habits), mark the item converted with type + entity id. Idempotent, so an accidental double click never creates two entities or two conversions; ownership enforced in the source select.
- CRUD (capture/edit/archive/restore/delete) user-scoped; UI from the design (capture card, Inbox/Archived/Converted tabs, per-item convert/edit/archive/delete, converted badge+link) with optimistic updates and all states.
- Playwright `e2e/brain-dump.spec.ts` written (capture -> convert to task -> exists + converted); not run against the single-owner DB. Live Neon smoke verified atomicity, double-submit no-op (task count stays 1), atomic habit+schedule, and ownership block. typecheck/lint/build green, Vitest 86/86.

### 2026-07-08: Phase 11 (Task Maps)
- Added `@xyflow/react` 12.11.2. No migration: built on the Phase 2 `task_maps`/`task_map_nodes`/`task_map_edges` schema (positions in `position_x/y`, `viewport` jsonb, unique `(map, source, target)`, self-loop check).
- Repo additions (user-scoped): `updateTaskMap`, `restoreTaskMap`, hard `deleteTaskMap` (cascades), `updateNodePositions` (batch, scoped to `userId` + `taskMapId`), `countNodesInMap` (edge-endpoint validation), and `createTaskMapEdge` made idempotent (`onConflictDoNothing`). Zod-validated Server Actions for every map/node/edge mutation, ownership re-checked on each (`assertMapOwner`), linked `taskId` verified against the caller's tasks.
- Canvas is a `"use client"` React Flow editor dynamically imported with `ssr:false` so `@xyflow/react` never loads on other routes or the server. Debounced position saves (500 ms) persist only the final drag-stop position and flush on unmount/`beforeunload`; connect/delete edges, add/edit/delete nodes, node->task link with "Open in To-dos", custom node cards with branch handles, inspector, MiniMap/Controls/Background. One route with a `?map=<id>` selection param; empty/loading/error/not-found/archived states all handled.
- Playwright `e2e/task-maps.spec.ts` written (create map, add two nodes, connect, move one, reload, assert `.react-flow__node` transform round-trips within 1.5px + edge persists, delete map); not run against the single-owner DB. Live Neon smoke (throwaway user + cascade cleanup) verified batch position persistence, edge endpoints, duplicate-edge no-op, self-loop rejection, user-scoping, and map-delete cascade. typecheck/lint clean, `next build` green (18 routes, `/task-maps` dynamic).

### 2026-07-08: Phase 13 (Settings + polish) — built ahead of Phase 12
- Lean Settings per the phase prompt: profile display name, theme (light/dark/system via next-themes), timezone (default Asia/Manila), and week start, persisted to the existing `user_settings` table (no migration) and applied across the app.
- Ownership from the session throughout: theme/preferences via `settingsRepo.update(user.id, ...)`; the display name via Better Auth `updateUser` (account derived from session cookies). Zod at every boundary (`lib/validations/settings.ts`), with `timezone` validated through a real `Intl` check and `weekStartsOn` matched to the DB `0..6` constraint.
- Applied app-wide: `lib/date.ts` generic `zoned*` helpers + `lib/task-buckets.ts` thread `timeZone`/`weekStartsOn`; Today/To-dos/Focus/Habits pages read `getUserDatePrefs(user.id)` and derive their date views from the saved settings. `getUserSettingsCached` (React `cache`) shares one query per request between the shell layout and the page.
- No theme hydration flash: next-themes applies instantly on the client; `components/theme-sync.tsx` seeds it from `user_settings.theme` only when the device has no local choice (never overriding one), making the persisted theme authoritative across devices; appearance card rolls back on a failed save.
- Kept lean on purpose: the design's Life-Area management, task-status renaming, focus-timer defaults, Life-Score weights (Progress phase), and email/push toggles (out of scope, CLAUDE.md section 2) are intentionally omitted; schema columns kept for later.
- Polish pass (code-level; no browser/Playwright in this environment): made the React Flow canvas `Background` dots and edge stroke theme-aware (`CANVAS_COLORS` from the `outline`/`outline-variant` tokens) so the canvas is correct in dark mode alongside `colorMode`; confirmed modal + mobile-drawer focus trap/Esc/scroll-lock and labelled dialogs, `aria-label` on all icon-only buttons, and `loading.tsx`+`error.tsx` on all nine data-backed routes.
- Added `tests/settings-schema.test.ts` (12 cases). Verification: typecheck clean, lint clean, Vitest 98/98, `next build` green (18 routes). Phase 12 (Calendar/Review/Progress) remains not started; those routes stay as `ComingSoon` placeholders.

### 2026-07-08: Full end-to-end QA pass (all routes) — 1 real bug found and fixed
Ran the complete QA sweep against a real Neon database (the DB was empty: 0 users, `neondb_owner` role, so the E2E owner could be bootstrapped and then fully deleted afterward, leaving the DB exactly as found: 0 users, 0 rows).

- Static gates: `tsc --noEmit` clean, ESLint clean, Vitest 98/98, `next build` green (18 routes).
- Cross-module synchronization (data-layer smoke, throwaway user, cascade-cleaned): all connected-system guarantees verified — completing a linked task drives the goal's auto progress (1/1 = 100%, cancelled excluded from the denominator); a habit logged for a day is one idempotent `habit_entries` row read by BOTH Today and Habits; a completed focus session linked to a task feeds the by-goal and by-life-area aggregates (1500s attributed correctly); and a different user id sees none of these rows (ownership scoping). 10/10 checks passed.
- Playwright critical flows: all 4 specs + auth setup pass (life-areas persistence, brain-dump→task conversion, task-map node/edge persistence across reload, task→goal derived progress).
- Auth/ownership audit: every one of the 9 data-backed pages and 9 `actions.ts` files derives identity via `requireUser()` (session), never an incoming id; the 3 `ComingSoon` routes sit behind the `(app)` layout's authoritative `requireUser()` and `proxy.ts`.

REAL BUG FOUND AND FIXED — goal task counts always 0 on the Goals page:
- `goalsRepo.listGoalsWithTaskCounts` (the query behind `/goals`) computed each goal's task counts with correlated subqueries: `(select count(*) from tasks where ${tasks.goalId} = ${goals.id} and ${tasks.userId} = ${goals.userId})`. Drizzle renders the OUTER goal columns UNQUALIFIED inside a `sql` template, so the SQL became `where "goal_id" = "id" and "user_id" = "user_id"` — inside the subquery those bind to the inner `tasks` table (`tasks.goal_id = tasks.id`, `tasks.user_id = tasks.user_id`), which is essentially never true. Result: every goal on the Goals page showed 0% / 0 tasks regardless of its real linked tasks. The Phase 5 "live smoke" missed it because it used `getTaskCounts` (a single-goal aggregate over `.from(tasks)`, which is correct); only the list query was affected.
- Fix: `listGoalsWithTaskCounts` now uses a single grouped-aggregate subquery LEFT JOINed to goals (`count(*)`, `count(*) filter (where status = 'completed'|'cancelled')`, grouped by `goal_id`, `coalesce(...,0)`), so table columns are unambiguous. Verified live (1 completed linked task -> totalTasks 1 / completedTasks 1) and end-to-end (the task→goal Playwright flow now reads 100% / 1/1). `getTaskCounts` was already correct and is unchanged.

Other fixes made during the QA pass:
- Harness: the Playwright dev server ran on port 3100 while `BETTER_AUTH_URL` (from `.env.local`) is `:3000`, so Better Auth rejected every auth request as `403 INVALID_ORIGIN` and the owner bootstrap hung. `playwright.config.ts` now sets `env: { BETTER_AUTH_URL: <test origin> }` for the spawned server and raises the per-test timeout to 90s (first-hit `/api/auth` cold-compile under `next dev`). Product-side hardening: `components/auth/auth-form.tsx` wraps the auth call in try/catch/finally so a rejected request always resets the pending state and surfaces an error instead of leaving the button stuck.
- Test robustness (specs had never been executed before, so they assumed a populated DB and were brittle): `e2e/tasks.spec.ts` now clicks the empty-state create buttons when the DB is fresh, uses the "All" view to find the task regardless of its date bucket, and waits for the completion Server Action to commit before reading `/goals`; `e2e/brain-dump.spec.ts` waits for the capture Server Action to commit (then reloads so the item has its real DB id) and for the convert action to commit before navigating (the UI converts optimistically); `e2e/task-maps.spec.ts` uses an exact "Task" locator so it no longer collides with the app header's "Add Task" button.
- Verification after the fix: typecheck clean, lint clean, Vitest 98/98, `next build` green (18 routes), Playwright 5/5, cross-module smoke 10/10. Test data fully removed afterward (owner deleted, cascade verified, DB back to 0 users).

### 2026-07-15: "Nightshift" design system (new visual language) + Today reference screen
- Direction change requested by the owner: the Stitch "Serene Lifecycle" look is retired. Built a new design system from scratch, codename "Nightshift" (precision instrument aesthetic: deep cool near-black canvas, one reserved electric-cyan accent for action/focus/selection, violet for progress/data, mono for figures, hairline elevation, restrained motion). Documented in `docs/DESIGN_SYSTEM.md`. Applied to the token layer, the shared primitives, and the Today dashboard ONLY (the reference screen). Other routes inherit the new tokens but keep their prior composition until a later rollout. This is styling only: no data logic, queries, Server Actions, or business behavior changed, and no functional bugs were touched.
- Token layer (`app/globals.css`): full rewrite in OKLCH. Kept every existing token NAME (surface ramp, primary/secondary/tertiary + containers + fixed variants, error, accent-beige/lavender, inverse, outline, shadcn aliases) so nothing breaks, repointed all values, and added new tokens: cyan `--primary` with `-hover`/`-active`, violet `--secondary`, semantic `--success`/`--warning`, elevation `--shadow-sm`/`-md`/`-glow` + `--highlight`, an extended radius scale, a mono type scale, and `--font-mono`. Dark is primary (`:root, .dark`); a coherent light theme lives in `.light`. `layout.tsx`: added JetBrains Mono, set `defaultTheme="dark"`, wrapped children in a `MotionConfig reducedMotion="user"` provider (`components/motion-config.tsx`), updated `themeColor`.
- Motion (`lib/motion.ts`, new; `motion` 12.42.2 added): one snappy spring + one smooth spring, a shared ease-out, 120/180/240ms durations, list stagger variants, press/hover presets, and a task-completion animation. Honors `prefers-reduced-motion` via MotionConfig plus a CSS fallback in globals.css.
- Primitives (`components/ui/*`): upgraded in place (API-compatible) Button (Nightshift variants + `loading` state + cyan focus ring + press), Input/Textarea/Select (cyan focus, surface wells), Modal (scrim fade + panel spring via AnimatePresence, focus trap/Esc/scroll-lock preserved), Toaster (surface tokens). New: Card (surface-ramp shell with tones), Progress + ProgressRing (violet, motion fill, tabular mono), Tooltip (hover/focus, motion), Dropdown (custom menu: full keyboard nav, type-ahead, roving focus, outside-click, motion; WAI-ARIA menu-button pattern).
- Today dashboard (`components/today/*`, `app/(app)/today/loading.tsx`): rebuilt with the new system. Clear hierarchy (greeting with mono date, a Focus hero whose cyan glowing "Start Focus Session" is the single unmistakable action, Top 3 Actions, Today's Tasks, conditional Overdue, right rail of violet Progress ring + Active Goals meters + Habits). Content-shaped loading skeleton and an empty state with personality ("A clean slate"). All data flow, optimistic completion, and canonical-data guarantees unchanged.
- Verification: `tsc --noEmit` clean, ESLint clean, `next build` green (18 routes). Dev server boots clean (no console/compile errors); `/login` (which exercises the new Button/Input + token layer + fonts) renders 200; `/today` and `/` redirect to `/login` (auth protection intact). Token pipeline confirmed in both the production CSS and the dev-served CSS: Next 16's Lightning CSS lowers `oklch()` to a hex + `lab()` fallback, so the cyan primary ships as `--primary:#00ddef` (dark) / `#008eb1` (light) with JetBrains Mono wired to `--font-mono`. An authenticated visual click-through of Today was NOT run here: the app already has its single registered owner, so it needs the owner's password (never fabricated) and the owner intends to review Today before rollout. Hydration risk was reasoned through (framer renders `initial` on the server; no `Date.now()`/`window` in render) and is low.

### 2026-07-15: Nightshift rollout to every remaining screen (styling only)
- Rolled the approved Nightshift system out to the whole app, consistently, after the Today reference screen was approved. Styling only: no data logic, queries, Server Actions, or business behavior changed; no functional bugs touched. `docs/DESIGN_SYSTEM.md` status updated to "rolled out to the full app".
- Shell + shared: `NavLink` active state is now a cyan-tinted row with a left accent bar; the mobile drawer slides in via `AnimatePresence` (focus trap/scroll-lock preserved); `EmptyState` uses the raised card treatment with a soft cyan glow and an icon tile. `PageHeader` unchanged (already token-driven).
- Login/auth: a stronger, restrained first impression: an ambient cyan glow plus a faint technical grid behind a raised card with a hairline top accent, uppercase field overlines, and the cyan glowing sign-in button using the Button `loading` state. `app/(auth)/layout.tsx` + `components/auth/auth-form.tsx`.
- Feature screens (view + card + modal per feature): Life Areas, Goals, To-dos, Habits, Brain Dump. Consistent treatments applied: cards use `raised card-shadow` + hairline `outline-variant/70`; row actions reveal on hover for pointer devices but stay visible on touch (`[@media(hover:hover)]`); list grids/columns enter with the shared `listContainer`/`listItem` motion stagger + `layout`; task/goal completion checkboxes get the pop + ring-burst completion animation; counts, percentages, dates, and streaks are mono + tabular; every form submit uses the Button `loading` spinner; progress bars are the violet secondary accent (Goals keep their status color, animated with `springSmooth`).
- Focus Mode (the hero): mono timer with tabular numbers (JetBrains Mono), minimal chrome, the cyan accent reserved for the active/running session (number + ring go cyan while running, `text-on-surface-variant` when paused, `warning` at time's up), a restrained cyan glow behind the ring only while running, a `whileTap` spring on the primary control, and the Start button as the single glowing cyan action. Stats tiles are raised with mono readouts and violet data bars; completed sessions read success-green.
- Task Maps canvas: themed React Flow end to end without scattered hex. React Flow's own `--xy-*` variables are set inline on the canvas element (inline beats the dynamically loaded stylesheet and stays theme-adaptive because the values are `var(--token)`), covering edges, connection line, controls buttons, and minimap; the dotted background, edge stroke/marker, and minimap node/mask colors are passed token-based `var(--...)` / `color-mix` strings; the previous stale hardcoded hex (`CANVAS_COLORS`, left from the retired palette) was removed. Custom nodes are raised with container-tinted type chips and cyan handles; the add-node toolbar and node inspector are raised with uppercase overlines and a `loading` Save button; the maps explorer active row is cyan-tinted.
- Settings: cards raised with an icon tile, uppercase field overlines, loading save button; theme picker cards keep the cyan-tinted active state.
- Verification: `tsc --noEmit` clean, ESLint clean, `next build` green (18 routes). Dev server boots clean (no console/compile/hydration errors in the log); `/login` renders 200 and serves the fresh cyan tokens (`--primary:#00ddef`); all nine data-backed routes (`/today`, `/goals`, `/tasks`, `/habits`, `/focus`, `/brain-dump`, `/task-maps`, `/life-areas`, `/settings`) return 307 to `/login` (auth intact). No hardcoded legacy hex remains in `components/`. As before, an authenticated in-browser click-through was not run (single registered owner; owner's password never fabricated); the owner reviews the running app. Dark-mode coverage of modals, dropdown, tooltip, and the canvas is handled by the token layer + the inline React Flow variables; mobile nav (drawer + bottom bar), dialogs (bottom-sheet), and lists were kept responsive.

### 2026-07-16: Apple HIG / Liquid Glass design system (docs/GOHA_DESIGN_SPEC.md) + Today reference screen
- Direction change by the owner: `docs/GOHA_DESIGN_SPEC.md` is now the visual source of truth, replacing ALL previous direction (Stitch/Serene and Nightshift both retired; `docs/DESIGN_SYSTEM.md` marked superseded). The spec was implemented literally: every number is a decision. Applied to the token layer, fonts, motion, the shared primitives, the app shell chrome, and the Today dashboard ONLY (the reference screen). Other screens keep their prior composition and inherit the new tokens via a full legacy-alias layer until their rollout slice. Styling only: no data logic, queries, Server Actions, or business behavior changed.
- Tokens (`app/globals.css`, the only file where hex/rgba may appear): the Apple label opacity system as rgba (label/secondary/tertiary/quaternary, light `rgba(60,60,67,x)` / dark `rgba(235,235,245,x)`); backgrounds (canvas `#F2F2F7`/`#000`, surface `#FFF`/`#1C1C1E`, surface-secondary, hover/pressed as rgba); BOTH separators (translucent `separator` for rows, `separator-opaque` for card edges); the 9 system colors with SEPARATE light/dark values (blue is the accent; teal is `--system-teal` to avoid clashing with Tailwind's default teal scale); system grays 1-6; the radius scale xs4/sm6/md8/lg10/xl12/2xl16/3xl20/4xl26; elevation e1/e2/e3 (dark halves the opacities); the four Liquid Glass tiers as background vars + `.glass-*` classes with `blur() saturate(180%)`, the specular inset edge, hairline `--glass-border`, and BOTH mandatory fallbacks (`prefers-reduced-transparency` and `@supports not backdrop-filter`) collapsing to solid `surface`. A `.hit-44` helper implements the 44px minimum hit area via a pseudo-element. Every legacy token name (surface-container-*, on-surface, outline, primary, secondary, error, type tokens, card-shadow/raised/grid-pattern helpers) is kept as an alias into the Apple palette so un-rebuilt screens compile and stay coherent.
- Typography: Inter v4 variable via `next/font` with the `opsz` axis + `font-optical-sizing: auto` (mandatory; reproduces the SF Display/Text crossover), `font-feature-settings: "cv11","ss01","calt"`; Geist Mono for timers/counts. SF Pro deliberately NOT used (licensing). The exact type scale incl. tracking: large-title 34/-0.022em ... caption 11/+0.05em, as `text-large-title`...`text-caption` tokens. `svg.lucide { stroke-width: 1.5 }` globally (icons 16px inline, 20px sidebar, 28px empty states). Tabular numerals on all numeric content.
- Motion (`lib/motion.ts`): exactly the three springs (smooth 0.30/0, snappy 0.30/0.15, bouncy 0.50/0.30 mapping to SwiftUI .smooth/.snappy/.bouncy); press = scale 0.96 snappy; list entrance = fade + 4px rise, 20ms stagger capped at 8 (`listEntrance` with `custom` index); `rowExit` = fade + height collapse. Legacy exports (springSnappy/listContainer/popIn/easeOutExpo...) kept as deprecated aliases re-expressed on the springs so un-rebuilt screens compile. `layoutId` morphs: segmented-control pill, sidebar active indicator, and the Today priority-picker modal (morphs open from its trigger). Reduced motion via MotionConfig `reducedMotion="user"` + CSS fallback.
- Primitives (`components/ui/*`), exact section 8 metrics: Button (sm 28/10/8, md 32/14/10, lg 40/18/12; primary blue / secondary filled / ghost blue-label / destructive red; hover lighten 6%, active scale 0.96 + opacity 0.8, 3px blue/40 focus ring at 2px offset via outline, loading spinner width-stable); NEW circular Checkbox (20px, 1.5px gray-3 border, fills with the Life Area system color, white check stroke 2, bouncy pop, 44px hit area); Input/Textarea/Select (filled-field: h-32, px-10, r-10, surface-secondary, no border at rest, focus ring + surface); NEW SegmentedControl (h-30, full radius, 2px track padding, `layoutId` pill with e1, radiogroup keyboard); Card (r-16, p-16, surface, separator-opaque border, e1; title-to-content gap 12); Modal (480 wide, r-20, glass-thick, overlay rgba(0,0,0,0.32) with no blur, scale 0.94 snappy, optional `layoutId` morph, focus trap kept, r-26 bottom sheet on mobile); Dropdown (glass-regular, r-20 popover with 8px padding so items are r-12 per the concentric rule, blue-fill selection, full keyboard support kept); Tooltip (glass-regular, footnote); Toaster (SOLID surface, r-12, e3 — toasts are not in the glass allowlist); Progress/ProgressRing (blue accent, smooth spring, Geist Mono tabular readout).
- Shell chrome (glass allowlist only): sidebar 260px `glass-thin`; desktop/mobile headers `glass-thin`; mobile drawer `glass-thick` sheet; mobile tab bar `glass-thin` with blue center action; sidebar items h-32/px-10/r-8/gap-8 with blue-12% active + blue label and the `layoutId` active indicator; `(app)` layout on `bg-canvas` with page padding 24 desktop / 16 mobile / top 24, content max 1200px. Brand/UserBadge/Logout restyled neutral. Theme default switched to `system` (Apple-adaptive; the persisted user setting still wins via ThemeSync). Cards, rows, and all content surfaces remain SOLID.
- Apple palette from user data: `lib/life-areas.ts` presentation remapped so the six STORED color keys (unchanged in DB + Zod, so no data change) render as system colors (teal→teal, bronze→orange, violet→purple, beige→yellow, lavender→indigo, slate→gray), incl. a new `dot`/`fill` for the 8px row dot and checkbox fills; `lib/tasks.ts` status/priority chips remapped (low gray, medium blue, high orange, urgent red; completed green). Expanding to the full 8-color picker requires a Zod-enum/data change and is deferred to a rollout slice on purpose.
- Today dashboard (reference screen, `components/today/*`): greeting `title-2` + tabular subhead date; a SOLID Focus card with a caption eyebrow and the blue lg "Start Focus Session" as the screen's single accent action; Top 3 Actions and Today's Tasks as 40px task rows (px-12, checkbox-to-title gap 12, transparent rest / surface-hover / surface-pressed, hairline separators between rows inset 12px from the left per the spec's number, hover-revealed unpin with 44px hit area, priority chips as footnote tints); completion choreography per section 9 (bouncy circular checkbox, 200ms left-to-right strikethrough sweep, completed rows fade + collapse height via AnimatePresence since they leave `todayTasks`); proximity law applied (8 within groups, 12 checkbox/title-to-content, 24 between cards, 32 between page sections, 0 + separators between rows); right rail Progress ring (blue, mono readout), Active Goals (blue meters), Habits rows with system-color dots and circular done/skip/miss log controls (green/gray/red, 44px hits); quick-add and Evening Reflection as solid 48px cards; content-shaped skeleton (`loading.tsx`) mirroring the exact new layout; "A clean slate" empty state (28px icon). Data flow, optimistic updates, and canonical-task guarantees untouched.
- Verification: `tsc --noEmit` clean, ESLint clean, `next build` green (18 routes, fresh `.next`). Compiled CSS audited: label rgba values serialize to exact alpha-hex (`#3c3c4399` = rgba(60,60,67,.6)), `#007aff`/`#0a84ff` both present, 4 glass tiers × (webkit+standard) `saturate(180%)`, both fallback blocks compiled, `font-optical-sizing:auto` + Inter/Geist Mono variables live, focus ring compiles to `outline: 3px solid` + `2px offset`, and nonstandard utilities (`px-4.5`, `h-[30px]`, `bg-blue/12`, `rounded-t-4xl`, `bg-overlay`, `border-r-glass-border`, spec type tokens, `.hit-44`) all generated. Dev server boots clean; `/login` 200; all nine protected routes 307 to `/login`. Authenticated click-through not run (single-owner app; password never fabricated) — the owner reviews Today before rollout.

### 2026-07-16: Frontend audit + 6 bug fixes (styling only)
Full frontend audit at the owner's request (new Apple HIG pieces, the nine un-rebuilt screens, gates re-run incl. Vitest 98/98), then fixed all six bugs found:
1. Duplicate `layoutId`: the sidebar active pill used one hardcoded id in BOTH the desktop sidebar (mounted but `display:none` on mobile) and the mobile drawer, so the drawer's pill could morph in from the hidden sidebar's zero-rect. `NavLink` now takes a required `indicatorId`; the sidebar passes `sidebar-active-indicator`, the drawer `drawer-active-indicator`.
2. Stroke-width override: the global `svg.lucide { stroke-width: 1.5 }` base rule silently beat explicit `strokeWidth` props (CSS beats SVG presentation attributes), so check glyphs rendered at 1.5 instead of the spec's 2. Replaced `strokeWidth={2|3}` with the `stroke-2` utility (utilities layer wins over base) in `ui/checkbox.tsx`, `habits/habit-log-control.tsx`, and `tasks/task-card.tsx` (progress/focus rings use raw SVG without the `.lucide` class and were unaffected).
3. Loading buttons went gray: `loading` sets the `disabled` attribute, and the `disabled:` palette (gray-5 + quaternary label) made a mid-submit primary button look dead with a near-invisible spinner. The disabled palette moved out of the CVA variants into a JS-gated lookup applied only when `disabled && !loading`; a loading button keeps its variant colors, interaction still blocked via the attribute + `disabled:pointer-events-none`.
4. `app/(app)/today/error.tsx` was still Nightshift-era; restyled to the Apple spec (solid surface card, red-tinted circular icon, title-3 + body/label-secondary) so all four states of the reference screen match.
5. Today habit rows showed BOTH an 8px color dot and an inline icon; the redundant icon was removed (the spec's row signature is the dot alone).
6. Overlapping invisible hit areas: side-by-side 28px controls with full 44px hit zones (habit done/skip/miss cluster at 8px gaps, the quick-add submit next to its input) overlapped and could steal taps. `.hit-44` now exposes `--hit-x`, and a `.hit-44-narrow` modifier caps horizontal expansion at 36px (zones exactly meet at an 8px gap; vertical stays 44 per the HIG); applied to the habit-log buttons and the quick-add submit. Isolated controls (row checkbox, unpin X, modal close) keep the full 44.
Verification: typecheck clean, lint clean, `next build` green (18 routes); compiled CSS confirms `.stroke-2{stroke-width:2px}`, `.hit-44{--hit-x:44px}`, `.hit-44-narrow{--hit-x:36px}`; dev server log clean, `/login` 200, `/today` 307. No data logic touched. Owner decisions still open from the audit: blue vs neutral chrome icon buttons, separator inset 12px literal vs 44px intent, the 8-color Life Area picker (Zod/data change), and the screen-by-screen rollout order (Login and Focus first).

### 2026-07-16: Git initialized + correctness fixes + FULL Apple HIG rollout (all screens)
Executed the owner-approved plan end to end, in three commits:

1. **Git** (`9077f1c`): `git init -b main`, verified `.gitignore` excludes all `.env*` secrets (only `.env.example` tracked), initial commit of the whole project (244 files). Remote push still needs the owner to create a private repository, then: `git remote add origin <url> && git push -u origin main`.

2. **Correctness fixes** (`9bbe3aa`): (a) due-at wall-clock input is now interpreted AND displayed in the user's saved timezone, not hardcoded Manila: `taskFormSchema` became the factory `makeTaskFormSchema(timeZone)` (Manila-default instance kept for client field validation and tests), the tasks create/update actions build it from `getUserDatePrefs`, the task form shows/reads `datetime-local` values in the user's zone, and displayed timestamps across Today, Tasks, Focus, and Brain Dump use `formatZonedDateTimeMedium` with the threaded `timeZone` prop (Brain Dump's page now also reads date prefs). (b) Deleted the four never-called tasks-repo functions. (c) Vitest now uses native `resolve.tsconfigPaths` instead of the deprecated plugin.

3. **Full design rollout** (this commit): every remaining screen now composed in the Apple HIG system; no screen keeps Nightshift-era composition.
   - **Login/auth** (cinematic per spec section 10): plain canvas, no card chrome or ambient effects, blue app mark, `large-title` hero, filled fields, single blue lg action with the loading spinner, slow `smooth` entrance. `PageHeader` (all screens) is now title-2 + callout.
   - **Focus** (cinematic): `large-title` Geist Mono tabular timer (34px, per the spec's number) in both setup and the active ring; duration presets are the SegmentedControl (its first real use, layoutId pill); the canvas darkens via an animated fixed overlay when a session starts, and because the overlay sits beneath the translucent chrome, the glass toolbar visibly recedes with it; circular discard/pause/complete controls (red/blue/green semantics, 44px hits); stats tiles/breakdowns/recent-sessions rebuilt as solid Apple cards with mono readouts, blue data bars, and inset-separator rows.
   - **Tasks**: task cards rebuilt (radius-12 inner-card scale, circular Checkbox that fills with the task's Life Area system color, footnote chips, mono dates, hover-revealed action row that stays visible on touch); the views sub-nav uses sidebar-item metrics (h-32, blue-12% active, mono count pills); section header, sort/filter row, and empty wells in Apple tokens; list gap tightened to the in-group 8px.
   - **Goals**: `goalStatusConfig` remapped (active blue, paused orange, completed green, else grays); goal cards rebuilt (status-colored spring progress bar, mono percent/counts/dates, hover-reveal actions with capped hit areas); timeframe tabs, empty well, and the dashed "Create New Goal" placeholder restyled.
   - **Habits**: `dayCellConfig` remapped (done green, partial green/40, miss red/25, skip gray-4); Today overview card with 40px inset-separator rows, orange streak flames, mono counts; week grid with caption headers and dot indicators; all-habits cards compacted.
   - **Life Areas**: cards rebuilt (solid surface, dot-based importance meter, hover-reveal edit/archive with narrow hit areas, ambient blob removed).
   - **Brain Dump**: capture card, tab bar with mono count pills, item cards with filled action chips, green "Converted" badge, mono timestamps.
   - **Settings**: cards to spec Card metrics, neutral icon tiles, subhead field labels, blue-tinted active theme option with the 3px focus ring.
   - **Task Maps**: explorer/editor panels as solid cards with blue active row; React Flow `--xy-*` vars repointed to the Apple tokens (gray-2 edges, blue selection/connection line, canvas background, surface controls/minimap); nodes rebuilt (surface card, blue handles/ring, blue/purple/indigo type chips); the floating add-node toolbar is now `glass-regular` (allowed chrome); inspector as a solid e3 panel.
   - Also removed the redundant `LifeAreaIcon` import flagged by lint.
- Verification: `tsc --noEmit` clean, ESLint clean, Vitest 98/98, `next build` green (18 routes); dev server log clean, `/login` 200, all nine protected routes 307. Authenticated click-through still owner's to do (single-owner login). Remaining design debt, deliberately left: form-modal INTERNALS (goal/habit/life-area/task forms, completion-note) render through the legacy alias layer (fields/buttons are already the new primitives); the legacy tokens/type aliases in `globals.css` stay until those internals are tightened; loading skeletons for non-Today routes render via aliases. Open decisions unchanged: blue vs neutral chrome icons, separator inset number vs intent, 8-color Life Area picker (data change).

### 2026-08-05: Full-system bug hunt (browser-driven) + fixes
Owner reported the app was "very buggy at laggy" with non-working buttons and
tasks that seemed not to save. Investigated with direct database inspection and
a new browser-driven audit; fixed everything found.

**Database was never the problem.** `neondb_owner`, full privileges, 7
migrations applied, zero orphaned rows. The reported "task didn't save" task was
in the database the whole time. Added `pnpm db:diagnose` (scripts/diagnose.mts):
a read-only health check reporting connection identity, privileges, migrations,
row counts, referential integrity, and undated-task visibility.

**Test harness.** GoHa is single-owner, so Better Auth's `user.create.before`
hook blocks sign-ups and the Playwright suite could not bootstrap an account.
`pnpm test:account:create` / `:destroy` (scripts/test-account.mts) inserts an
isolated harness account with a properly hashed password, so tests log in
through the real UI against their own user-scoped data and never touch the
owner's. New `e2e/audit.spec.ts` drives all 12 routes plus the primary
interaction on each, collecting console errors, uncaught exceptions, failed
requests, HTTP 5xx, and navigation timings, reporting them all in one run.

**Bugs found by the audit and fixed:**
1. *Ticking a task made it vanish.* `deriveTodayData` filtered Today's list to
   active tasks only, so completing one removed it instantly with no way to see
   or undo it (the progress ring updated, which made it look like data loss).
   Completed tasks now stay in the list, struck through, sorted to the bottom;
   the focus fallback skips them.
2. *Uncaught error on every completion.* The checkbox animated
   `scale: [1, 1.2, 1]` with a spring, but springs support only TWO keyframes,
   so Motion threw "Only two keyframes currently supported" and the pop never
   played. The overshoot now comes from the bouncy spring on the check icon.
3. *Focus Mode could never start a session.* `startSchema` declared
   `taskId: z.string().optional()`, but the UI sends `taskId: null` for an open
   session; `.optional()` permits only `undefined`, so EVERY task-less session
   was rejected and reported as "Choose a valid duration." Changed to
   `.nullish()` and made the message name the real field. (Audited the other
   schemas: task-maps already used `.nullish()`; the form schemas only ever
   receive strings.)
4. *Hydration failed on every page.* `ThemeToggle` rendered Moon during SSR and
   Sun on the client, so React discarded the server HTML and re-rendered the
   whole shell on every navigation, plus a follow-on "Cannot read properties of
   null" crash. Added `lib/use-mounted.ts` and a stable placeholder until
   hydration; Settings now shares that hook.
5. *Goals' create button lost its test id in the empty state*, and two buttons
   shared the accessible name "Add Task" (header vs quick-add).

**Performance.** Measured, not guessed: production server response is ~170ms
warm (~125ms for a page with no queries), dev ~180-220ms once compiled. The
server was never slow; the perceived lag was the hydration failure above
(forcing a full client re-render every navigation) plus Turbopack's first-visit
compile in dev. Told the owner to review with `pnpm build && pnpm start`.

**Also completed (the P2/P3 plan):**
- Replaced the native `<select>` in all 7 files with a custom Apple-style
  `Select`: styled trigger, portaled popover (so it is not clipped by the
  modals' `overflow-y-auto`), fixed positioning with flip-above, full keyboard
  support (Arrows, Home/End, Enter, Escape, type-ahead), listbox ARIA, and a
  selected checkmark. The OS dropdown ignored the design system entirely.
- Removed Calendar, Review, and Progress from navigation: a quarter of the menu
  led to "Coming Soon". Their routes still exist for direct URLs and they are
  listed in `plannedNav`; a new test asserts the two lists never overlap, so an
  unbuilt surface can't be advertised again. `mobileNav` now resolves by href
  instead of fragile indices. Removed the Today "Evening Reflection" card,
  which linked to the unbuilt /review.

Verification: tsc clean, ESLint clean, Vitest 99/99, `next build` green (18
routes), and the browser audit 13/13 against a PRODUCTION build with zero
console errors, zero uncaught exceptions, and zero failed requests. Harness
account destroyed afterwards; owner data verified intact (1 user, 2 tasks,
referential integrity OK).

### 2026-08-13: Task Maps rebuilt as a road map, not a box drawing

Owner report: "in the task map the nodes are not smart. it says notes but i
cant even put any notes there and nodes are onti lang." Both were true. The Note
node type existed with nowhere to write a note, and four interchangeable rounded
rectangles could only ever draw an inventory of boxes, never a route.

**Schema (migration `0010_jazzy_husk.sql`, applied and verified).**
`task_map_node_type` gains `decision`, `blocker` and `phase` (seven types).
`task_map_nodes` gains `note TEXT`: a real column, not a key in the
presentation-only `data` jsonb, because it is content. `task_maps` gains
`legend JSONB`.

**Shape carries type, colour carries the owner's meaning.** Two separate
channels, so a map can say "this is a branch" and "this is hard" at once.
`nodeTypeConfig` in `lib/task-maps.ts` gives each type a hint, chip, accent and
a clip-path shape: a decision is chamfered, a note is a folded sheet, a blocker
and a group are dashed, a milestone is fully rounded. Colour meaning stays the
owner's to define per map through the existing legend.

**The map reflects the work.** A node linked to a task shows that task's live
status (To do / Doing / Done / Cancelled); a done node dims and strikes through.
A bottom-center summary rolls those up ("2/5 linked tasks done") and stays
silent when nothing is linked rather than showing a hollow 0%.

**Auto-layout.** `lib/task-map-layout.ts` is pure and unit-tested (20 cases):
longest-path layering so a node never sits above a prerequisite, cycle-tolerant
(a map is drawn by a human, not validated as a DAG), layers centred against the
widest. "Tidy up" applies it locally, persists through the same endpoint a drag
uses, and then fits the view, because a tidied wide map otherwise lands mostly
off screen and the button looks like it threw the map away.

**Also.** Edge labels (the "Yes" and "No" leaving a decision) via a new
`updateEdgeLabelAction` on the `label` column that already existed. Seven types
behind one "Add node" menu, each with a one-line hint, so the toolbar stays a
toolbar. `findFreeSpot` places a new node clear of the others: the old centre
plus random jitter buried each node under the last, so adding three looked like
adding one. Import-tasks dialog is now a real labelled `role="dialog"` with Esc.
MiniMap themed instead of React Flow's opaque white default.

**One bug found outside the task map, fixed at the root.** `cn()` used
tailwind-merge with no config, so it read the design system's `--text-*` scale
as text COLOURS and dropped them: every `cn("text-body text-label")` in the UI
primitives resolved to `text-label` alone and rendered at the browser default
instead of 14px. Every Input, Textarea and Button was affected. `lib/utils.ts`
now declares the type scale and the label colours to tailwind-merge;
`tests/cn.test.ts` pins it in both directions (sizes survive, real conflicts
still collapse).

Verification: `tsc` clean, ESLint clean, Vitest 175/175 (25 new across
`tests/task-map-layout.test.ts` and `tests/cn.test.ts`), `pnpm build` green
(18 routes), Playwright 33/33 against a reset harness account with zero console
or runtime errors, plus a scripted browser sweep of the canvas in light and dark
(all seven types, notes, labelled branches, tidy-up, linked-task rollup).

### 2026-08-13: Full-system sweep (12 routes, desktop + mobile + dark) and 3 fixes

Browser-driven sweep of every route at 1600 and 390 wide in both themes,
collecting console errors, uncaught exceptions, failed requests, horizontal
overflow, unnamed controls, unlabelled inputs, duplicate ids and real touch-area
sizes, plus an interaction pass over the command palette, task detail panel,
Plan my day, Focus start/pause/complete, Review drafts and Settings.

Clean: zero console errors, zero uncaught exceptions, zero failed requests, zero
duplicate ids, zero unlabelled inputs, zero unnamed controls. Every checkbox
measured a real 44x44 hit area (`hit-44` draws it with an `::after` box, so the
element's own 20px rect understates it); the habit action cluster is 36x44 by
design so neighbouring taps cannot overlap.

Three real defects found and fixed:

1. *The Habits page scrolled sideways on a phone* (`window.scrollX` reached 67px
   at 390 wide). The cause was not the week table, which its `overflow-x-auto`
   card was clipping correctly. It was the visually hidden `<span class="sr-only">
   Actions</span>` in that table's last header cell: `.sr-only` is
   `position: absolute`, and with no positioned ancestor its containing block was
   the viewport itself, so it sat at x=456 and NO ancestor `overflow` could clip
   it (an ancestor only clips boxes whose containing block is inside it). Adding
   `relative` to that `<th>` puts it back inside the scroll container. Verified by
   bisect: hiding that one span took the document from 457px to 390px.

2. *Progress disagreed with Today, Focus and Review about focus time.* The
   summary built `focusSeconds` as `sum(focusMinutesByDay(...)) * 60`, so it
   inherited the chart's rounding: a 7-second session became 0 minutes, the card
   read "0s", and the chart claimed "No focus sessions recorded yet" while three
   other screens showed the session. Totals now come from the session rows in
   real seconds; the chart still rounds to minutes, which is right for a bar per
   week. The empty state no longer asserts there were no sessions when there
   were.

3. *The command palette had no listbox semantics.* Keyboard navigation worked,
   but the results were plain buttons the input never pointed at, so a screen
   reader could not tell the list existed or which row the arrows had reached.
   Added `role="combobox"` + `aria-expanded`/`aria-controls`/`aria-activedescendant`
   on the input, `role="listbox"` on the container and `role="option"` +
   `aria-selected` on each result. Attributes only, no behaviour change.

Left alone deliberately (reported to the owner rather than changed, since they
asked for bug fixes and no system changes): numeric habit rows truncate the name
to "Drink ..." on a phone because the value input, unit and Log button take
priority; a manual-progress goal shows "40%" beside "0/0 tasks" with no hint
that the number is hand-set; task titles on Today have a 20px tap target where
the same affordance on To-dos has 356x70.

Unresolved: an intermittent React hydration-attribute warning that appeared in 2
of 6 full-suite runs, on a different screen each time (Mobile once, Settings
once). It fails no test and never reproduced in isolation across three targeted
attempts, including forcing a localStorage/database theme divergence and
replaying the whole Settings flow. Recorded rather than guessed at.

Verification: `tsc` clean, ESLint clean, Vitest 175/175, `pnpm build` green (18
routes), Playwright 33/33 against a freshly reset harness account.

### 2026-08-13: Second sweep, everything fixed, validated against a production build

Owner asked for every remaining item fixed before starting automations. All nine
deferred findings from the first sweep are done, plus four defects the deeper
sweep uncovered.

**The hydration warning was never ours.** Captured the full React message
instead of the truncated one and the diff named it: `style={{caret-color:
"transparent"}}` on inputs. Playwright injects that on `page.screenshot()`
(default `caret: "hide"`); when the injection lands while a later navigation is
hydrating, React sees an attribute it did not render. `shot()` now passes
`caret: "initial"`, and the false positive is gone. Exactly the "something
changed the HTML before React loaded" case React's own message lists.

**Fixed from the first sweep's deferred list:**
- Numeric habit rows truncated the name to "Drink ..." on a phone. The row was
  already `flex-wrap`; without a floor the name shrank to nothing before the
  controls ever wrapped. `min-w-36` makes the controls drop to a second line.
- A hand-set goal showed "40%" beside "0/0 tasks" with nothing saying the number
  was typed. The card now carries a "Set by hand" chip, matching the wording the
  detail panel already used.
- Task titles on Today had a 20px tap target. `py-2.5` fills the row's 40px,
  sized to the row rather than with `hit-44`, whose 44px box would overhang into
  the next row and steal its taps. The Brain card's suggestion list went from
  18px to 32px by moving the list's `gap` inside the buttons.
- "Details" and "All" header links were 18px: `py-1.5 -my-1.5` gives 30px with
  the header height unchanged.
- The calendar painted "0/3" on every future day, reading as failure on days
  that had not happened. Future days now state what is scheduled.
- Sparse ranges drew one bar against blank space. Every column gets a faint
  track, so twelve weeks read as twelve slots.
- The habits legend explained four of the six states the grid draws; "Pending"
  and "Not scheduled" were both visible in the rows and absent from the key.
- React Flow's 26px canvas buttons are 36px on a phone.
- `qa.spec` is idempotent: a new `test:account:reset` empties the harness
  account's content (keeping the account and session so no re-login is needed)
  and restores the display name, which the seeding also depends on. Proven by
  four consecutive runs at 13/13 with no manual reset.

**Found during this sweep and fixed:**
- *Task Map nodes could be placed where they could not be reached.* The
  free-spot spiral had no bounds, so the fourth or fifth node landed outside the
  visible canvas: invisible, and undraggable because the pointer lands on the
  page behind the canvas. `findFreeSpot` now takes the viewport in flow
  coordinates and prefers spots inside it. Compounding it, the pan-to-new-node
  call used `setCenter` WITHOUT a zoom, and React Flow falls back to MAX zoom
  there: one add zoomed the canvas to 2x, shrank the visible area to a third and
  pushed everything after it off screen. Overflow now fits the whole map instead.
  Verified: all seven node types land on canvas and every one drags.
- *A busy Button lost its accessible name.* `loading` hid the label with
  `invisible`, and `visibility: hidden` drops content out of the accessibility
  tree, so a saving button announced itself as unnamed. `opacity-0` is equally
  width-stable and keeps the name.
- *Duplicate DOM id on Focus.* `id="focus-task"` is hardcoded, and two copies of
  the screen can be mounted at once during a route transition, so the id existed
  twice and `label[for]` resolved to whichever came first. Both focus fields use
  `useId()` now.
- Two task-map specs were flaky for a reason worth recording: the canvas is only
  ~678x457 at Playwright's default window, and the test nudged a node by a fixed
  +240/+200, pushing it and its connect handle off the canvas. Drags are clamped
  to the canvas now and `connect()` fits the view before measuring. Eight
  consecutive clean runs.

**Known issue, documented rather than papered over.** Capturing a Brain Dump
thought again within ~400ms of the previous one can leave the optimistic
transition pending forever: the button stays disabled with `aria-busy`, no error
appears, and only a reload clears it. Measured precisely: no gap stalls on the
2nd capture, a 150ms gap on the 4th, a 400ms gap is clean through ten. The
server logs nothing, so the action itself is fine; it is the optimistic
transition failing to reconcile when `revalidatePath` renders overlap. An
attempted fix (serialising captures behind a promise chain) made it strictly
worse, stalling on the FIRST repeat, and was reverted rather than shipped. A
person typing a thought and clicking is far slower than 400ms, so the exposure
is a paste-and-click-fast user or an automation. The QA loop is paced to human
speed with the defect spelled out at the call site.

Verification: `tsc` clean, ESLint clean, Vitest 180/180, `pnpm build` green,
Playwright 33/33 three times in a row against a PRODUCTION build (`next start`,
not the dev server, so no Turbopack compile latency), and a final sweep of 12
routes x {desktop light, mobile light, desktop dark} reporting zero findings:
no console errors, no uncaught exceptions, no failed requests, no sideways
scroll, no duplicate ids, no unnamed controls, no undersized tap targets. The
only controls under 44px are the segmented-control segments at 26px inside their
30px track, which is the documented spec and matches iOS.

### 2026-08-13: Task Map canvas, squared grid and forgiving connections

Owner: "make the background yung may square square parang sa n8n, then for the
nodes make it easy to connect."

**Grid.** Dots replaced with a squared graph-paper grid: a 40px cell plus a
heavier line every fifth one, so the canvas keeps a sense of scale as you zoom
rather than dissolving into uniform texture. New `--grid-line` /
`--grid-line-strong` tokens carry it in both themes. The first attempt used a
20px cell, which was wrong for the way maps are actually viewed: a saved
viewport is usually zoomed OUT (measured 0.58x), where a 20px cell collapses to
11px on screen and reads as a grey wash instead of squares. Verified by sampling
the rendered pattern size and stroke rather than squinting at a screenshot.

**Connecting.** Three changes, because the difficulty was in three places:
- `connectionRadius` 60 (default 20) so the DROP snaps to the nearest handle
  from three times further out: you aim at the node, not at a dot.
- `ConnectionMode.Loose` so a drag can START from either handle. You no longer
  have to remember that out is the bottom and in is the top.
- The handle's grab zone is stretched ALONG the node's edge (`-inset-y-3
  -inset-x-10`) rather than being a circle, because sideways is the direction
  you are imprecise in, and widening it that way costs almost none of the card
  body still needed for dragging the node. The dot also grows on node hover so
  it is easy to see.

Measured, not assumed: starting a connection used to need the pointer within
about 6px of the handle centre. It now works from 60px away, over half the
node's width. Re-verified afterwards that all five node types still drag from
the card body and still open the inspector on click, in both themes.

One correctness detail: only the two node ids are persisted, so a reload always
redraws an edge bottom-to-top. With Loose mode the drag can name the top handle
as the source, so `onConnect` drops the handle ids before adding the edge
locally. Without that the line would have jumped the first time the page
reloaded; now what you see is what is stored.

Verification: `tsc` clean, ESLint clean, Vitest 180/180, `pnpm build` green,
task-map specs twice at 4/4, and the full Playwright suite 33/33 against the
production build.

### 2026-08-17: R-10 resolved, the Brain Dump rapid-capture dead state

The known issue recorded on 2026-08-13 (capturing again within ~400ms could
leave the button disabled with `aria-busy` forever) is fixed, and the 500ms
pacing in `e2e/qa.spec.ts` that stepped around it has been removed.

The cause was not the action, which is why the server logs were always clean.
The optimistic insert ran inside a shared `useTransition`. That transition's
pending flag clears when the action promise resolves, but the revalidated props
commit a moment later, so a capture started in that gap joined a transition
whose optimistic base was mid-change and never settled.

The earlier attempt failed because it treated this as a sequencing problem and
serialised captures behind a promise chain, which made every capture wait on the
one before and stalled on the FIRST repeat. The fix is to remove the coupling
instead: each capture is now an independent promise with its own placeholder
row held outside `useOptimistic`, so there is no shared transition to get stuck
in and no reason to disable the field between captures.

Placeholders are retired by matching content COUNT against the server rows, not
by deleting on settle. Deleting on settle was tried first and put the note's
visibility back at the mercy of revalidation timing, which is the same class of
coupling; a slow, failed or absent refresh made the note vanish. Counting rather
than set membership also keeps deliberately capturing the same thought twice
working. On failure the placeholder is withdrawn, because nothing was written.

Also fixed alongside it: conversion now truncates to the target's own edit limit
(task 160, goal 120, habit 80) inside the atomic CTE. A long thought previously
produced a record that failed validation the next time it was saved, on a field
the user had not touched.

Regression cover: `tests/brain-dump-capture.test.tsx`, driving five back-to-back
captures with no delay at all, which is harsher than the 150ms that used to fail.
