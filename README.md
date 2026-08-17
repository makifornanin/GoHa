# GoHa

**Goals, Habits, and ACTION.** A private, single-owner execution system.

Its whole point is the chain, not the parts:

> Life Area -> Goal -> Sub-goal -> Task / Habit -> Today -> Focus -> Complete -> Reflect

It is not a to-do app, a habit tracker, a goal list, or a timer. It is what
connects them: a task completed on Today moves the goal it belongs to, a habit
logged anywhere is the same entry everywhere, and every "this week" is derived
from real dates in your own timezone rather than stored on a row.

---

## Running it

Requires Node (see `.nvmrc`) and pnpm (pinned in `package.json`).

```bash
pnpm install
cp .env.example .env.local     # then fill in the real values
pnpm db:migrate                # apply the schema
pnpm dev                       # http://localhost:3000
```

`/register` is a one-time bootstrap: it creates the single owner and then
closes. There is no second account, and the database refuses one.

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | The app |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | The gates. All three must pass before a phase is called done. |
| `pnpm test:e2e` | Playwright. Refuses to run outside a database marked `goha_test`. |
| `pnpm db:generate` | Diff the schema to a new SQL migration, offline |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:check` | Migration files agree with each other |
| `pnpm db:studio` | Browse the database |
| `pnpm db:backup` | **The** backup: all tables, no caps, to `./backups` |
| `pnpm db:restore-check` | Verify a backup file is complete and readable |
| `pnpm db:diagnose` | Read-only structural report (never prints content) |

---

## How it is built

| | |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Data | Neon Serverless Postgres, Drizzle ORM, Drizzle Kit migrations |
| Auth | Better Auth, email/password, single owner |
| UI | Tailwind CSS 4, a small hand-built component set, lucide-react, Sonner |
| Validation | Zod at every server boundary |
| Tests | Vitest for logic and components, Playwright for flows |

Four rules hold the shape of it:

1. **Server Components read; Server Actions write.** `"use client"` only where
   there is genuine interaction.
2. **All data access goes through `db/`.** The UI never imports Drizzle.
   `DATABASE_URL` is server-only and never `NEXT_PUBLIC_*`.
3. **Identity comes from the session**, never from an incoming id, and every
   query is scoped to it.
4. **Nothing derived is stored.** Today, This Week, goal progress, streaks and
   every statistic on Progress are computed on read, so reopening a task last
   month corrects the history instead of leaving a stale snapshot behind.

Local dates are a first-class concept, not a formatting detail: a habit logged
at 12:30 AM belongs to that local day. The rules live in `lib/date.ts` with
boundary tests, and take the timezone saved in Settings.

---

## Automations

GoHa sends nothing. It has no scheduler, no push infrastructure, and no
third-party integrations, by constitution.

What it does have is a small token-authenticated read surface, so something you
run elsewhere (n8n, Make, Shortcuts) can ask it what to say. The brief it
returns is the same judgement the Today screen shows, produced by the same code.

See **[docs/AUTOMATION.md](docs/AUTOMATION.md)**. Tokens are managed in
Settings -> Automations.

---

## Where things are written down

| File | What it holds |
| --- | --- |
| `CLAUDE.md` | The project constitution. The rules that do not bend. |
| `docs/BUILD_PLAN.md` | The living plan and change log: what was built, verified, and deferred, and why. |
| `docs/DATABASE.md` | Schema reference: tables, relations, constraints, invariants, migrations. |
| `docs/GOHA_DESIGN_SPEC.md` | The visual source of truth. |
| `docs/AUTOMATION.md` | The automation surface. |
| `docs/GoHa-Automation-Guide.pdf` | Building the automations themselves, outside the app. |

---

## Working on it

- Migrations are generated, read, committed, and applied by hand. Never
  `db:push` against a database that holds real data.
- Destructive test tooling refuses to run unless the target database is marked
  `goha_test` (`scripts/lib/require-test-db.mts`). That guard is deliberately
  self-contained.
- CI runs typecheck, lint, unit tests, a production build, and a check that the
  schema has no uncommitted migration. It holds no credentials and never
  touches a database.
- Secrets live in `.env.local`, which is not tracked. `.env.example` lists
  variable names and nothing else.
