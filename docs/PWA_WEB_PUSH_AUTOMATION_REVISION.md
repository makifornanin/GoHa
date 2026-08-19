# PWA and Web Push Automation Revision

Date: 2026-08-18

## Revision statement

GoHa's primary phone-delivery architecture is now standards-based PWA Web Push. Ordinary users
do not need Apple Shortcuts, Apple Personal Automations, Pushcut, a personal n8n installation, or
a GoHa API token to receive notifications.

The change replaces the delivery and trigger path, not the deterministic judgement inside GoHa.
Task ranking, habit outcomes, local dates, user preferences, dedupe, quote selection, review
ownership, and Sabbath remain application responsibilities.

```text
Earlier phone path
Apple Personal Automation or Shortcut
  -> n8n or GoHa personal-token API
  -> Shortcut or third-party push service
  -> local phone notification

Revised ordinary-user path
central n8n schedule
  -> internal GoHa worker API
  -> GoHa-owned structured user payload
  -> optional Gemini narration
  -> GoHa atomic dedupe and Web Push
  -> installed GoHa Home Screen app
  -> visible phone notification
```

Apple Shortcuts may remain an optional future power-user integration. They are not the normal
onboarding path.

## Important source limitation

The implementation audit searched the working tree and Git history for the claimed revised guide
set:

```text
GoHa Guide 00 - Foundations
GoHa Guide 01 - Morning Brief
GoHa Guide 02 - Evening Summary
GoHa Guide 03 - Deadline / Smart Polls
GoHa Guide 04 - Health Ping
GoHa Guide 05 - Graveyard Sweep
GoHa Guide 06 - Review Pre-fill
GoHa Guide 07 - Sabbath Mode
```

Those eight revised files are not in this repository. The only automation PDF found is the older,
eight-page combined file `docs/GoHa-Automation-Guide.pdf`. That document describes an earlier
Make/n8n, Pushcut, and Shortcut design and does not contain the revised 00 through 07 contracts
named in the implementation request.

The guide-by-guide mapping below therefore uses the revision requirements supplied with the
implementation task and verifies them against current executable code. It does not claim to have
verified text that is absent. Exact graveyard/review schedules, model prompts, and Sabbath
defer/catch-up semantics were not invented.

The original PDF is retained as historical product context. Its earlier delivery decision was
reasonable for the system that existed then; it was intentionally superseded to remove technical
setup from multi-user onboarding.

## What is implemented now

- A Next.js App Router manifest declares a stable standalone GoHa app and install-sized icons.
- A push-only service worker displays every push visibly and handles safe same-origin deep links.
- Service-worker registration uses feature detection and never requests permission on page load.
- Notification permission is requested only from the visible Enable Notifications action.
- One user can own multiple browser subscriptions. Each endpoint has exactly one owner.
- A short-lived one-time QR setup intent replaces the old consumer token-carrying QR.
- QR setup still requires normal GoHa authentication and rejects a different signed-in account.
- A central service-authenticated n8n contract claims server-owned jobs without exposing `userId`.
- Durable jobs, logical notification claims, and per-device delivery rows provide retry-safe
  dedupe.
- Permanent invalid push subscriptions are removed without blocking a user's other devices.
- Existing personal automation tokens and public automation APIs remain intact for developer use.

The additive migration `db/migrations/0016_famous_joseph.sql` has been generated and reviewed. It
is not applied by this handoff.

## Guide impact matrix

| Guide | Earlier delivery assumption | Revised delivery | Deterministic logic retained | Current activation |
| --- | --- | --- | --- | --- |
| 00 Foundations | Per-user tooling, credentials, and phone bridge | One server-only worker credential plus user-owned Web Push subscriptions | Token security, user scoping, atomic notification keys, saved settings, and Sabbath ownership | Worker and push foundations implemented |
| 01 Morning Brief | Phone/Shortcut initiated or received the final result | Central poll materializes a due job; n8n may narrate; GoHa pushes | Day ranking, complete overdue data, priorities, habits with safe cadence, goals, quote parity, quiet result, fallback, and `brief:morning:{localDate}` | Active at the user's saved planning time |
| 02 Evening Summary | Phone/Shortcut initiated or received the final result | Central poll materializes a due job; n8n may narrate; GoHa pushes | Completed/slipped tasks, habit outcomes, focus totals, Top 3 result, quiet result, fallback, and `brief:evening:{localDate}` | Active at the saved reflection time on the same local date |
| 03 Deadline / Smart Polls | Users created several Personal Automations or polling shortcuts | Central claim poll finds due task and focus work; GoHa pushes only actionable items | Deadline window, overdue-today classification, focus overrun, server-owned keys, Sabbath suppression | Deadline and focus active; streak inactive |
| 04 Health Ping | n8n calls the health endpoint and emails infrastructure incidents | Unchanged | Public liveness, authenticated database readiness, UP/DEGRADED/DOWN classification basis, Sabbath exemption | Existing `/api/health` retained |
| 05 Graveyard Sweep | Scheduled external workflow and longer email digest | Email may remain; optional push is not required | Existing deterministic graveyard personal-token endpoint remains | No central-worker schedule, because revised schedule/defer rules are absent |
| 06 Review Pre-fill | External AI workflow reads week stats and writes a draft | Existing personal-token review flow may remain until its central contract is verified | User/week ownership, empty-field-only writing, completed-review protection, atomic write behavior | No central-worker schedule; R-05 safeguards implemented in existing route |
| 07 Sabbath Mode | External workflow had to honor server context before phone delivery | Server decides eligibility before it leases or delivers any active job | Per-user rest day, timezone/local date, one morning rest message, work-alert silence, health exemption | Active for morning/evening/deadline/focus; graveyard/review defer behavior pending guides |

## Guide 00: Foundations

The foundational separation remains:

```text
personal automation token = optional API/integration authorization
push subscription         = one authenticated user's delivery endpoint
pairing secret            = temporary setup intent
worker secret             = central trusted-service authentication
```

These credentials are not interchangeable.

GoHa now persists:

- `push_subscriptions`, one row per browser/device endpoint.
- `push_pairing_sessions`, one hash-only short-lived intent per user.
- `automation_jobs`, durable server-owned due work.
- `push_deliveries`, per-notification/per-endpoint retry state.

The existing `notification_log` remains the logical dedupe layer. Existing hash-only automation
tokens, scopes, expiry, revoke/delete, and request history remain supported.

The old practice of giving an automation a direct database connection or a caller-supplied user ID
is not part of the central worker design. GoHa derives each account, date, timezone, and key.

## Guide 01: Morning Brief

The delivery trigger changes, but GoHa still builds the structured brief through the same
application services used by the personal-token route. The worker:

- waits until the user's saved `dailyPlanningTime` in that user's timezone;
- uses the current local date and does not truncate overdue records;
- reuses Today's ranking, tasks, goals, daily priorities, habit views, quote selection, and saved
  week start;
- omits flexible X-per-week/month habits from day-specific automation output until their period
  semantics are canonical;
- remains quiet when the deterministic payload says nothing merits interruption;
- gives n8n a server-created fallback presentation;
- claims `brief:morning:{localDate}` per user before sending.

Gemini may narrate the structured result. It must not recalculate facts. If Gemini fails, n8n calls
completion with `outcome: "use_fallback"`.

## Guide 02: Evening Summary

Evening data also reuses the current application builder. It covers completed tasks, planned work
that remains open, target-aware habit outcomes, focus minutes, streak labels, and the Top 3 result.

The current worker activates the summary at `eveningReflectionTime` only on that same local date.
It does not create an after-midnight prior-day job. This is a deliberate conservative boundary:
the revised guide that would define an intended previous-day or catch-up policy is absent. Owners
should choose a same-evening reflection time until that requirement can be verified.

The logical key is `brief:evening:{localDate}`. Sabbath and quiet results remain silent.

## Guide 03: Deadline and Smart Polls

Users no longer create several Apple Personal Automations. A central poll calls GoHa, and GoHa
materializes only actionable task deadlines and focus overruns for enabled accounts with active
subscriptions.

Retained rules include:

- `deadline:{taskId}:{dueAtIso}`, so rescheduling re-arms the task.
- `focus:{sessionId}:overrun`, one nudge per focus session.
- User-specific `deadlineLeadMinutes`.
- Server-side current task/session validation before delivery.
- Sabbath suppression.
- Silence when nothing qualifies.

Streak-at-risk delivery is not active. See the R-06 section below.

## Guide 04: Health Ping

Health monitoring was not moved into the user push queue.

`GET /api/health` remains the infrastructure contract. A bare request reports safe process
liveness. A valid personal automation token adds database readiness, latency, version, and time.
The endpoint continues to support an n8n classifier that emails the owner on incident and recovery.
Health remains exempt from Sabbath because infrastructure failure is not user work.

## Guide 05: Graveyard Sweep

The existing personal-token route `/api/automation/graveyard` and its deterministic data service
remain. A longer graveyard digest may continue through email.

The central worker does not currently materialize `graveyard` jobs. The revised guide's exact
schedule and its Sabbath defer/catch-up behavior are not present in the repository. Adding a guess
would risk a duplicate, a skipped week, or delivery on the wrong day. Optional Web Push can be
considered only after the revised contract is supplied.

## Guide 06: Review Pre-fill

The existing routes remain available:

```text
GET  /api/automation/review/week-stats
POST /api/automation/review/draft
```

R-05 safety work strengthens the write path:

- The requested `weekStart` remains part of the user-scoped database key.
- Draft filling is one conditional insert/upsert statement.
- Each AI field is written only when the stored field is empty at write time.
- A review completed before the write is not updated.
- Human edits made during an AI round trip are not overwritten by a stale read-then-upsert.
- Reopening validates that the requested date is an actual boundary for the user's saved
  `weekStartsOn` and updates only an existing completed row.
- ISO date parsing rejects impossible normalized dates.

The central worker does not materialize `review_draft` jobs. The schema reserves `targetDate` for
a future immutable week target, but the missing revised schedule and prompt have not been
invented. Existing review automation can continue with a scoped personal `read_write` token.

## Guide 07: Sabbath Mode

Sabbath remains a GoHa rule, not an n8n branch.

For active worker kinds:

- A due morning brief becomes one `sabbath` rest message when morning notifications are enabled.
- Evening summary is silent.
- Deadline and focus-overrun alerts are silent.
- The setting is evaluated in each user's timezone and local date.
- Delivery rechecks the rule after a job is leased.
- Health remains exempt.

Streak is inactive. Graveyard and review are not scheduled by the central worker, so their exact
defer/catch-up behavior is not claimed as implemented.

## R-05 review state safety

Relevant executable implementation:

- `db/repositories/reviews.ts`: `fillEmptyReviewDraft` and `reopenWeeklyReview`.
- `app/api/automation/review/draft/route.ts`: maps the external `nextWeekFocus` contract and uses
  the atomic empty-field writer.
- `app/(app)/review/actions.ts`: validates the week boundary and performs update-only reopen.
- `lib/validations/automation.ts`: strict round-trip ISO-date validation.

This makes the existing review draft endpoint safer for its explicit `(user, weekStart)` target.
It does not activate the central review job. A final database-backed concurrency test for the new
conditional upsert should be run only against a guarded test database, never the owner database.

## R-06 shared habit outcome safety and remaining gap

Relevant executable implementation:

- `lib/habit-outcome.ts` is the shared outcome vocabulary and completion/denominator predicate.
- `lib/habit-streaks.ts` uses the shared logged outcome and now respects schedule `endDate` and
  explicit `daysOfMonth`.
- `lib/habit-view.ts` carries all schedule fields into the canonical schedule shape.
- `lib/progress.ts` resolves every heatmap day through `habitOutcome`; below-target and null-value
  numeric completions no longer count as complete, and explicit skips stay neutral.
- `app/(app)/habits/actions.ts` refuses a new numeric `done` entry without a value.
- Morning/evening habit consumers reuse shared views and omit cadence shapes that have no
  unambiguous due day.

One gap remains: a flexible habit such as three times per week or eight times per month needs a
period-level progress denominator, not seven or thirty daily obligations. Current streak code has
period semantics, but the progress heatmap still treats each day as eligible. To avoid false daily
nudges, the worker does not activate `streak_risk`, and day-specific morning/evening habit lists
omit flexible X-per-period schedules. This limitation must be resolved before streak automation is
enabled.

## iPhone onboarding revision

The polished QR concept remains, but its purpose changed.

Earlier consumer flow:

```text
QR -> permanent read_write automation token -> Apple Shortcut setup
```

Revised flow:

```text
Settings -> create 10-minute one-time setup secret
  -> QR holds /iphone/setup#pair=<secret>
  -> iPhone client strips the fragment immediately
  -> public staging POST places it in a short-lived HttpOnly cookie
  -> normal GoHa login is required
  -> matching account adds GoHa to Home Screen
  -> explicit Enable Notifications tap requests iOS permission
  -> active Push API subscription is saved to that account
```

PostgreSQL stores SHA-256 and a harmless prefix, not the raw setup secret. Regenerating replaces
the previous session. Consumption is conditional on matching user, hash, unused state, and server
database time. The code cannot read GoHa data or create a login session by itself.

A device is connected only when the authenticated account has a non-disabled, non-expired Web
Push subscription. Creating a QR or an API token is not a connected state. Disconnecting the
current endpoint leaves other devices intact.

## Owner and normal-user Settings

Every account receives the consumer PWA connection card and simple automation preferences.
Normal users do not see bearer tokens, scopes, n8n, VAPID, endpoint keys, or service-worker terms.

The exact owner/developer account `milcamark7@gmail.com` additionally keeps the advanced
Automation/API card, including token creation, read/read_write scopes, expiry, revoke/delete,
request history, sent-notification history, and endpoint reference. The new PWA card appears
alongside it rather than replacing it.

Invitation creation and management are restricted to the installation owner. The registration
path no longer labels an invited or open-signup account as a bootstrap owner, and an invitation
whose issuer is not the current owner is rejected.

## Deployment and operating changes

Before enabling delivery:

1. Generate and securely store one VAPID key pair.
2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and
   `AUTOMATION_WORKER_SECRET` locally and in Vercel.
3. Confirm the target database, then apply `db/migrations/0016_famous_joseph.sql` once.
4. Deploy GoHa over HTTPS.
5. Configure one encrypted worker credential in n8n and implement
   `docs/n8n-web-push-contracts.md`.
6. Test install, permission, subscription, test push, deep link, and disconnect on a real supported
   iPhone Home Screen installation.
7. Test two users and multiple devices before enabling scheduled delivery.
8. Leave streak, graveyard, and review worker kinds inactive until the documented gaps are closed.

## Superseded instructions

For ordinary notification delivery, disregard earlier directions to:

- install or configure a GoHa Apple Shortcut;
- create Apple Personal Automations for morning, evening, or polling;
- scan a QR containing a permanent GoHa API token;
- configure Pushcut/Pushover as the main phone bridge;
- store `GOHA_USER_ID` or one personal GoHa token per user in n8n;
- reproduce timezone, habit, ranking, or Sabbath rules in n8n.

Developer automation tokens, Siri/Shortcuts experiments, Scriptable widgets, and other power-user
integrations may still be useful separately. This revision removes them as prerequisites for a
normal user.

## Known limitations

- The claimed revised guide files are absent. Exact Gemini prompts and graveyard/review schedules
  remain unverified.
- Streak-at-risk delivery is inactive until flexible X-per-period progress is canonical everywhere.
- Evening jobs do not infer a previous-day target after midnight.
- Graveyard and review have no central-worker schedule or Sabbath catch-up policy.
- Web Push is retry-safe through durable job and per-device ledgers, but an external push provider
  cannot offer a transactional exactly-once receipt.
- No offline-first cache was added. The service worker is intentionally push-only.
- Browser simulators and unit tests cannot substitute for a deployed HTTPS Home Screen test on a
  real supported iPhone/iPad.
- Migration 0016 is not applied by this handoff.
