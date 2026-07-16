# CLAUDE.md — GoHa Project Constitution

This file is read automatically at the start of every Claude Code session. It holds the durable rules for the project. Individual session prompts stay short and reference these rules instead of repeating them.

---

## 1. What GoHa is

GoHa (Goals, Habits, and ACTION) is a private personal execution system for one owner. Its conceptual chain is:

Life Area → Goal → Sub-goal → Task / Habit → Today → Focus → Complete → Reflect

It is not a to-do app, a habit calendar, a goal list, or a timer on their own. It connects them. The database stays user-scoped so multi-user support is possible later, even though V1 is single-owner.

---

## 2. Scope discipline

Build in two stages on ONE complete schema. Define the full schema from day one, but only build the MVP module UIs and logic first.

MVP (V1a), build these first:
- Authentication
- Life Areas
- Goals (with hierarchy and progress)
- Tasks / To-Dos (date-derived views, completion feedback)
- Today Dashboard

Expansion (V1b), add each as its own later slice, no re-architecture:
- Habits (boolean + numeric, schedules, entries, streaks)
- Focus Mode
- Brain Dump
- Task Maps (React Flow)
- Settings polish

Out of scope for the app itself (do not add these into GoHa): AI assistant or recommendations, Make.com, n8n, Telegram, email automation, push notification infrastructure, calendar sync, team or social features, billing, complex gamification. External automations can be layered on top later as separate integrations, never baked into V1.

---

## 3. Tech stack (do not substitute without a documented, technical reason)

Core: Next.js 16 (App Router), React 19, TypeScript in strict mode, pnpm.
UI: Tailwind CSS 4.x, shadcn/ui used selectively, lucide-react, next-themes, Sonner.
Database: Neon Serverless Postgres, Drizzle ORM, Drizzle Kit.
Auth: Better Auth with the Drizzle adapter, email/password.
Validation: Zod at every server boundary.
Client state: Zustand only where genuinely needed (active focus timer, task map editor interaction). Never as a persistence layer or a global mirror of the database.
Task Map: @xyflow/react.
Dates: date-fns.
Testing: Vitest for logic, Playwright for critical flows.
Quality: ESLint, strict TypeScript, no unresolved type errors.

Forbidden: Supabase, Firebase, Prisma. Do not turn the app into a default shadcn dashboard. The design is the visual source of truth, shadcn is only an implementation aid.

---

## 4. Architecture rules

- Server Components by default. Add "use client" only for interactive forms, timers, drag and drop, React Flow, browser APIs, or genuine local interaction. Never at a whole page or layout boundary without reason.
- Database reads and initial page data: server side.
- Mutations: Server Actions by default. Route Handlers only when justified (Better Auth handler, future external integrations).
- Data access goes through a single repository layer under `db/` (the seam). UI and components never import Drizzle directly. This is what lets the schema, the mock phase, and the live database swap cleanly.
- `DATABASE_URL` is server only. Never `NEXT_PUBLIC_*`. Never queried from client components.

---

## 5. Security and authorization (non-negotiable)

- Derive the user identity from the authenticated session, never from an incoming `user_id`.
- Every domain query and mutation is user-scoped: `where id = input.id AND user_id = session.user.id`.
- Validate every mutation input with Zod, then rely on database constraints as a second integrity layer.
- Never hardcode credentials or secrets in source, git history, `.env.example`, docs, tests, or comments.
- Return user-friendly validation errors. Never swallow database errors.

---

## 6. Timezone rules (Asia/Manila)

- Primary user timezone: Asia/Manila.
- Audit timestamps (`created_at`, `updated_at`): `TIMESTAMPTZ`, real instants.
- Date-bucketed business concepts (a local calendar date): a proper `DATE` column.
- Habit entries carry both: `entry_date DATE` and `created_at TIMESTAMPTZ`. A habit done at 12:30 AM Manila belongs to that local date, not the UTC date.
- Never truncate UTC timestamps naively to derive local dates. Centralize all date and timezone helpers in one module. Add unit tests around date boundaries.

---

## 7. Data integrity and connectedness

- No localStorage as the source of truth for domain data. PostgreSQL is authoritative.
- One connected system: a task completed on Today updates the same task in Tasks and any linked goal progress. A habit logged on Today writes the same habit entry seen in Habits. No dashboard-only duplicate data.
- No static `bucket = "today"` fields. Derive Today, This Week, This Month, This Quarter from `scheduled_for` / `due_at` plus timezone-aware rules.
- No delete-and-reinsert for edits. No blanket synchronization that can erase unrelated rows.
- Prefer archive or deactivate over hard delete for valuable entities (Goals, Life Areas, Habits, Task Maps). If hard delete exists, confirm it and handle dependents deliberately (cascade, restrict, or set null on purpose).

---

## 8. Identifier and migration rules

- Consistent UUID-based primary keys across all tables. Do not mix ID strategies.
- Drizzle Kit migrations, generated files tracked in git. No manual undocumented DB edits. No destructive reset as normal workflow.
- Scripts: `db:generate`, `db:migrate`, `db:studio`.

---

## 9. UI, states, and design fidelity

- The design is the visual source of truth (Stitch MCP, or screenshots in `design/`). Preserve typography, spacing, color, radius, hierarchy, navigation, cards, controls, and responsive behavior. Extend conservatively in the same visual language only where a needed state is missing.
- Design tokens as CSS variables / Tailwind theme. No scattered arbitrary hex values.
- Every major data surface handles loading, empty, error, and success states. No blank white panels. No fake endless skeletons.
- Responsive across desktop, laptop, tablet, mobile. Real mobile navigation, no clipped dialogs, adequate touch targets, no horizontal overflow.
- Optimistic UI only where rollback is correct and a failed save is made visible. Never show success before a failed persistence without rollback.
- Sensible accessibility: semantic HTML, keyboard support, visible focus, form labels, accessible dialogs, icon-button names.

---

## 10. Working style and quality gates

- Work in the phases defined in `docs/BUILD_PLAN.md`. Keep that file updated: mark phases not started, in progress, completed, or blocked, and record what changed, key files, and verification performed.
- Do not mark a phase complete on the basis that code was written. Verification is required.
- Before ending any feature phase, run: typecheck, lint, and `pnpm build`. Fix root causes, not symptoms. Do not suppress console, hydration, key, or type warnings.
- Preserve a clean git diff. Do not destroy existing files you were not asked to touch.
- If you hit a genuine hard blocker (a missing external credential that cannot be safely inferred), stop and say so clearly. Never fabricate a credential or replace a real integration with localStorage.
- Formatting rule for all generated docs and comments: never use the em dash character. Use commas or colons.
