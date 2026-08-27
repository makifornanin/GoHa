# GoHa n8n Web Push Contracts

Status: application contract implemented on 2026-08-18. The additive migration
`db/migrations/0016_famous_joseph.sql` has been generated and reviewed, but it has not been
applied to production. The worker cannot operate until that migration and the required server
environment variables are present.

## Purpose and trust boundary

One central n8n installation can process due work for every eligible GoHa account. n8n does not
store a personal GoHa automation token per user and never chooses a `userId`, local date,
timezone, entity, week, or dedupe key.

GoHa owns all of those values. A worker receives only an opaque job ID, its kind, and a short
lease ID. GoHa rebuilds the structured payload from current user-owned data before both payload
delivery and final completion.

The normal user automation-token API under `/api/automation/*` is separate and remains supported.
It is not the credential used for these internal routes.

## Prerequisites

Configure these server-only values in local `.env.local` and in Vercel:

```dotenv
VAPID_PUBLIC_KEY=<public VAPID key>
VAPID_PRIVATE_KEY=<private VAPID key>
VAPID_SUBJECT=mailto:<operations contact>
AUTOMATION_WORKER_SECRET=<high-entropy random secret>
```

Requirements:

- Keep the VAPID key pair stable across deployments. Replacing it requires devices to subscribe
  again.
- `VAPID_PRIVATE_KEY` and `AUTOMATION_WORKER_SECRET` must never use a `NEXT_PUBLIC_` name.
- Put `AUTOMATION_WORKER_SECRET` in an encrypted n8n credential, not directly in a workflow node
  or exported workflow JSON.
- Use the same public HTTPS GoHa origin configured in `BETTER_AUTH_URL`.
- Apply `db/migrations/0016_famous_joseph.sql` only after confirming the intended database target.
  The migration is forward-only and additive. It is intentionally not applied by this code
  handoff.
- At least one user must explicitly enable an automation kind and have an active Web Push
  subscription. No subscription means no job is materialized for that user.

One way to generate a VAPID key pair locally is:

```powershell
pnpm exec web-push generate-vapid-keys --json
```

Treat that command's private-key output as a secret. Do not paste it into source control, logs,
screenshots, or this document.

## Authentication and common headers

Every internal worker request uses:

```http
Authorization: Bearer <AUTOMATION_WORKER_SECRET>
Accept: application/json
```

Every job-specific request also uses the lease returned by the claim response:

```http
X-GoHa-Job-Lease: <leaseId>
```

Authentication fails closed when the environment value is absent. Missing and incorrect secrets
receive the same response:

```http
HTTP/1.1 401 Unauthorized
Cache-Control: no-store
Content-Type: application/json

{"error":"Unauthorized."}
```

The comparison is based on fixed-length SHA-256 digests and `timingSafeEqual`. The worker secret
is distinct from personal `goha_...` automation tokens. There is no separate route-level rate
limiter on this internal surface; the credential must remain private, and deployment-level
network and abuse controls should be enabled where available.

All internal worker responses set `Cache-Control: no-store`.

## Lifecycle at a glance

```text
n8n schedule
  -> POST /api/internal/automation/jobs/claim
  -> for each leased job:
       GET /api/internal/automation/jobs/{id}
       -> action=skip: stop for that job
       -> action=process:
            optional Gemini narration from structured payload
            -> success: POST .../{id}/complete with outcome=deliver
            -> model unavailable: POST .../{id}/complete with outcome=use_fallback
            -> workflow infrastructure failed before completion: POST .../{id}/fail
```

Do not call `/complete` after a payload response with `action: "skip"`. GoHa already marks that
job skipped.

## 1. Claim due jobs

### Request

```http
POST /api/internal/automation/jobs/claim
Authorization: Bearer <worker secret>
Content-Type: application/json

{"limit":10}
```

The body may be empty. The default limit is 10. `limit` must be an integer from 1 through 25.
No other property is accepted. In particular, `userId`, date, timezone, kind, entity ID, and
dedupe key are rejected. The request body is capped at 1,024 bytes.

### Success response

```json
{
  "jobs": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "kind": "morning_brief",
      "leaseId": "22222222-2222-4222-8222-222222222222",
      "leaseExpiresAt": "2026-08-18T00:15:00.000Z"
    }
  ],
  "pollAfterSeconds": 300
}
```

The response intentionally omits user identity, local date, target date, entity identity, and the
dedupe key. n8n should keep each `id` and `leaseId` together and must not mix them between items.

### Claim status behavior

| Status | Meaning |
| --- | --- |
| `200` | Claim succeeded. An empty `jobs` array is normal. |
| `400` | Invalid JSON, non-object body, or an unrecognized property. |
| `413` | Body exceeds 1,024 bytes. |
| `422` | `limit` is outside 1 through 25 or is not an integer. |
| `500` | GoHa could not materialize or lease work. Retry the poll with backoff. |

## 2. Read a leased job payload

### Request

```http
GET /api/internal/automation/jobs/{id}
Authorization: Bearer <worker secret>
X-GoHa-Job-Lease: <leaseId>
```

Both path ID and lease ID must be UUIDs. The row must still be in `leased` state and its lease must
not have expired.

### Process response

```json
{
  "job": {
    "id": "11111111-1111-4111-8111-111111111111",
    "kind": "morning_brief",
    "localDate": "2026-08-18",
    "timezone": "Asia/Manila",
    "dedupeKey": "brief:morning:2026-08-18",
    "payloadVersion": 1
  },
  "action": "process",
  "payload": {},
  "fallbackNotification": {
    "title": "Your GoHa morning brief",
    "body": "Start with the most important item on your day.",
    "url": "/today"
  }
}
```

`payload` is server-derived and kind-specific. The active forms are:

- `morning_brief`: `localDate`, `timezone`, `isSabbath`, `generatedAt`, `quote`,
  `dailyInspiration`, `recommendation`, `reason`, `state`, complete `topPriorities`, task groups
  `overdue`, `dueToday`, and `scheduledToday`, `habitsToday`, `activeGoals`, `counts`,
  `alreadyDelivered`, and `quiet`. The overdue array is not truncated by GoHa.
- `evening_summary`: `localDate`, `timezone`, `isSabbath`, `generatedAt`,
  `tasksCompleted`, `tasksPlannedNotDone`, `habitOutcomes`, `focusMinutes`,
  `focus7DayAvg`, `streaksKept`, `streaksBroken`, `top3Result`, `alreadyDelivered`, and
  `detailLevel`.
- `deadline`: one task item with `id`, `title`, `priority`, `dueAt`, `minutesUntil`,
  `dedupeKey`, `localDate`, and `timezone`.
- `focus_overrun`: one session item with `sessionId`, optional `taskTitle`, planned and elapsed
  duration data, `minutesOver`, `dedupeKey`, `localDate`, and `timezone`.
- `sabbath`: `localDate`, `timezone`, `isSabbath: true`, the canonical rest `message`, and an
  optional deterministic quote.

### `dailyInspiration` on `morning_brief`

The one canonical inspiration for that user and that local calendar date. GoHa decides it, stores
it, and serves the identical record to the Today card and to this payload, so the app and the
notification can never show different content on the same morning.

```json
{
  "dailyInspiration": {
    "type": "bible_verse",
    "text": "Commit your deeds to Yahweh, and your plans shall succeed.",
    "source": "Proverbs 16:3",
    "translation": "WEB",
    "provider": "bible_api"
  }
}
```

| Field | Notes |
| --- | --- |
| `type` | `quote` or `bible_verse`. Roughly an even split, decided once per local date. |
| `text` | The content itself. Never truncated by GoHa; over-long provider content is rejected and refetched instead. |
| `source` | An author for a quote, a `Book chapter:verse` reference for scripture. |
| `translation` | Present for scripture only, currently always `WEB`. **Absent** for quotes, not null. |
| `provider` | `zenquotes`, `bible_api`, or `goha_fallback` when no provider was reachable. Identifies the source only; GoHa shows any required credit in its own UI, and the notification body does not need to carry it. |

`dailyInspiration` is `null` only when the day could not be resolved at all, which does not stop
the brief being sent. The older `quote` field is unchanged and still populated from the curated
`daily_quotes` pool, so an existing workflow keeps working; new work should read
`dailyInspiration`.

The workflow decides how, and whether, to use this. GoHa does not compose the sentence around it,
does not add a greeting, and does not rank it against the rest of the brief. `evening_summary`
deliberately does NOT carry this field.

n8n may send the morning or evening structured payload to Gemini for concise presentation. It
must not ask the model to recalculate dates, completion, streaks, ranking, Sabbath, or dedupe.
For deadline, focus, and Sabbath jobs, the deterministic fallback is already sufficient unless a
later verified guide explicitly requires narration.

### Skip response

```json
{
  "job": {
    "id": "11111111-1111-4111-8111-111111111111",
    "kind": "morning_brief"
  },
  "action": "skip",
  "reason": "disabled"
}
```

GoHa may skip because the preference was disabled, timezone changed, local date became stale,
no active subscription remains, Sabbath now applies, the entity is stale, the payload is quiet,
or the kind is not active. Treat `reason` as a bounded operational code, not as a prompt.

### Payload status behavior

| Status | Meaning |
| --- | --- |
| `200` | `action` is `process` or `skip`. |
| `404` | Invalid IDs, missing row, mismatched lease, wrong state, or expired lease. |
| `409` | GoHa derived a skip but could not atomically close the job because its state changed. |
| `500` | Payload preparation failed. Call `/fail` only while the lease is still valid; otherwise allow a later claim cycle to recover it. |

## 3. Complete and deliver a job

Use exactly one of the following bodies.

### Completing an email-delivered digest

Graveyard and review are sent by the workflow itself, so they complete without a push:

```http
POST /api/internal/automation/jobs/{id}/complete
Authorization: Bearer <AUTOMATION_WORKER_SECRET>
X-GoHa-Job-Lease: <leaseId>
Content-Type: application/json

{"outcome":"acknowledge","taskIds":["<uuid>", "..."]}
```

`taskIds` is optional and only meaningful for `graveyard`: it is stored in the notification log so
the next week's digest can count repeat appearances by task id rather than by title. Sending
`acknowledge` for a push kind is refused, so a workflow cannot silently swallow a notification the
user was meant to receive.

The dedupe key is still claimed, so re-running the same week sends no second email.

### Deterministic fallback

Use this whenever Gemini fails, times out, or produces unusable output. An AI failure should not
become a missed notification.

```http
POST /api/internal/automation/jobs/{id}/complete
Authorization: Bearer <worker secret>
X-GoHa-Job-Lease: <leaseId>
Content-Type: application/json

{"outcome":"use_fallback"}
```

### Model-rendered presentation

```http
POST /api/internal/automation/jobs/{id}/complete
Authorization: Bearer <worker secret>
X-GoHa-Job-Lease: <leaseId>
Content-Type: application/json

{
  "outcome": "deliver",
  "notification": {
    "title": "Your GoHa morning brief",
    "body": "Start with the launch task. Two overdue items still need a decision.",
    "url": "/today"
  }
}
```

Presentation constraints are enforced again by GoHa:

- `title`: non-empty plain text, at most 80 characters.
- `body`: non-empty plain text, at most 240 characters.
- `url`: a same-origin path beginning with one `/`, at most 512 characters. External,
  scheme-relative, backslash, and script URLs are rejected.
- No extra request properties are accepted. There is no `userId`, date, entity, kind, or dedupe
  override.

GoHa re-reads the leased job and rebuilds its payload before sending. It then atomically claims the
logical notification for that job, writes a per-device delivery record, and sends to every active
subscription belonging to the job's user. n8n never calls a push provider directly.

### Completion response examples

```json
{
  "status": "completed",
  "attempted": 2,
  "succeeded": 2,
  "permanentFailures": 0,
  "transientFailures": 0
}
```

```json
{
  "status": "retrying",
  "reason": "transient_push_failure",
  "availableAt": "2026-08-18T00:06:00.000Z",
  "attempted": 2,
  "succeeded": 1,
  "permanentFailures": 0,
  "transientFailures": 1
}
```

Other terminal results use `status: "skipped"` or `status: "failed"` plus a bounded `reason`.
A conflict uses `status: "conflict"`.

### Completion status behavior

| Status | Meaning |
| --- | --- |
| `200` | Job completed or was safely skipped. |
| `202` | A transient device failure scheduled the same job for retry. Do not retry it directly with the old lease. |
| `404` | Job or active lease was not found. |
| `409` | Lease expired, dedupe lost, or job state changed. Stop processing that item. |
| `422` | Invalid body or notification presentation. If the lease is still valid, call again with `use_fallback`. |
| `500` | GoHa failed while completing. Do not blindly replay an uncertain provider send. Let GoHa's lease and ambiguity rules decide the row. |

## 4. Report a pre-delivery workflow failure

Use this only when n8n cannot continue before `/complete` starts Web Push. A Gemini-only failure
should use `use_fallback` instead.

```http
POST /api/internal/automation/jobs/{id}/fail
Authorization: Bearer <worker secret>
X-GoHa-Job-Lease: <leaseId>
Content-Type: application/json

{"code":"gemini_transport_failed"}
```

`code` must match `[a-z0-9][a-z0-9_:-]{0,63}`. No other property is accepted.

| Status | Meaning |
| --- | --- |
| `200` | Failure was recorded as terminal. |
| `202` | GoHa scheduled a retry and invalidated the old lease. |
| `404` | Job or lease was not found. |
| `409` | Job state changed before failure handling. |
| `422` | Failure code or body is invalid. |
| `500` | GoHa could not record the failure. |

## Scheduling, timezone, and date ownership

- Claim is both the scheduler tick and queue claim. Run it on a recurring n8n schedule. The API
  recommends a 300-second poll interval.
- Each account is evaluated in its own saved IANA timezone.
- Morning uses the saved `dailyPlanningTime`; evening uses the saved
  `eveningReflectionTime`. A null or invalid time means no job.
- A daily job becomes due at or after its saved wall time only on that same local calendar date.
  A later poll can catch it during that day. GoHa deliberately does not create a prior-day daily
  job after local midnight.
- A nonexistent local wall time during a DST jump is skipped rather than moved to a surprising
  time.
- Deadline look-ahead uses each user's `deadlineLeadMinutes`.
- A timezone change invalidates an already-materialized job instead of delivering under the wrong
  date.
- n8n must never infer or submit a local date. The date in the leased job is authoritative.

The absent revised evening guide means an intended after-midnight previous-day policy could not
be verified. No such policy was invented. Configure evening reflection for the intended same-day
time until that guide is supplied and reviewed.

## Sabbath behavior

The Sabbath decision stays server-side and uses each user's saved `sabbathDay`, timezone, and local
date.

- Morning becomes one `sabbath` rest message at the saved planning time when morning brief is
  enabled.
- Evening, deadline, and focus-overrun delivery are suppressed.
- Health monitoring remains exempt.
- Streak delivery is inactive.
- Graveyard and weekly-review scheduling are inactive because their revised defer/catch-up rules
  were not available to verify. n8n must not invent those rules.

The server rechecks Sabbath during payload preparation and again during completion, so a stale
workflow branch cannot override it.

## Dedupe, leases, and retries

There are three related layers:

1. `automation_jobs` is unique on `(user_id, dedupe_key)`. Repeated scheduler polls do not create
   another job for the same account and logical event.
2. `notification_log` is unique on `(user_id, dedupe_key)`. The logical notification is claimed
   atomically before provider delivery.
3. `push_deliveries` is unique on `(notification_id, subscription_endpoint_hash)`. A retry can
   avoid devices whose provider already accepted that logical notification.

Current active keys are:

| Kind | Key |
| --- | --- |
| Morning | `brief:morning:{localDate}` |
| Evening | `brief:evening:{localDate}` |
| Deadline | `deadline:{taskId}:{dueAtIso}` |
| Focus overrun | `focus:{sessionId}:overrun` |
| Sabbath | `sabbath:{localDate}` |

Jobs use a 15-minute lease and at most five claim attempts. Retry backoff is deterministic: 1, 5,
15, then 60 minutes, bounded by the attempt limit and the job's local date. Each device delivery
uses a separate two-minute send lease.

A provider `404` or `410`, invalid subscription key material, or an endpoint that violates the
outbound-network policy is terminal for that subscription and the row is disabled/deleted. A bad
device does not stop other devices. DNS/network and other non-permanent failures stay retryable.

If a process dies before provider delivery begins, an expired job lease can return to pending. If
the process dies after `deliveryStartedAt`, the job is marked `failed` with an ambiguous-delivery
code rather than blindly replayed. Web Push providers do not offer a transactional exactly-once
receipt, so this is retry-safe best effort, not a mathematical exactly-once guarantee.

## Active and inactive worker kinds

The database enum includes all planned notification kinds, but only verified behavior is active.

| Kind | Worker status | Notes |
| --- | --- | --- |
| `morning_brief` | Active | Saved planning time, current local date, deterministic fallback. |
| `evening_summary` | Active | Saved reflection time, current local date, deterministic fallback. |
| `deadline` | Active | User lead window, server-owned task and key. |
| `focus_overrun` | Active | One job per active session overrun. |
| `sabbath` | Active | Replaces the normal morning message on the saved rest day. |
| `streak_risk` | Inactive | Flexible X-per-week/month habit semantics are not canonical across all consumers yet. |
| `graveyard` | Active | Weekly, on the last day of the saved week at the planning time. Email-delivered: complete with `acknowledge`. |
| `review_draft` | Active | Weekly, on the last day of the saved week at the reflection time. `targetDate` carries the week under review. Email/write-delivered: complete with `acknowledge`. |
| `health` | Separate | Continue using `/api/health`; incident and recovery email may remain in n8n. |
| `test` | User action only | Settings sends to the authenticated user's exact current device. |

`streak_risk` stays inactive until flexible X-per-period habits have a period-level progress
denominator. Until then a daily "your streak is at risk" job would fire against a denominator that
treats every day as an obligation, which is a false alarm rather than a missing feature.

### Weekly digests and Sabbath deferral

Graveyard and review are keyed to the week (`graveyard:{isoWeek}`, `review:{weekStart}`), so the
database key does the once-per-week work and the scheduler only answers "is it time yet". Nothing
is materialized on the owner's rest day; the next poll on the first working day finds the same week
key unclaimed and fires then. A catch-up run does not wait for the original clock time, because it
is already late.

Neither kind requires a registered device. They are delivered as email by the workflow, so a user
who never installs the PWA still receives them.

## Old flows and APIs

For ordinary users, these assumptions are superseded:

- An Apple Personal Automation starts morning, evening, or smart polling.
- An Apple Shortcut holds a GoHa bearer token.
- n8n sends a result back to a Shortcut so the Shortcut can show a local notification.
- Each user runs or configures their own n8n instance.

The replacement is the central claim/payload/complete lifecycle above, followed by GoHa-managed
Web Push.

The following personal-token APIs remain supported for developer and optional power-user
integrations:

```text
GET  /api/automation
GET  /api/automation/quote/today
POST /api/automation/quotes
GET  /api/automation/brief/morning
GET  /api/automation/brief/evening
GET  /api/automation/due
GET  /api/automation/graveyard
GET  /api/automation/review/week-stats
POST /api/automation/review/draft
POST /api/automation/log
POST /api/automation/brain-dump
```

Those routes continue to authenticate a user through a hash-only bearer token and never accept a
caller-controlled `userId`. Do not substitute `AUTOMATION_WORKER_SECRET` on those routes. The owner
account `milcamark7@gmail.com` retains the advanced token/scopes/expiration/revoke/delete/request
history UI.

`GET /api/health` also remains separate. The unauthenticated liveness response is
`{"status":"ok"}`. A valid personal automation token receives the detailed readiness shape used to
classify application and database health. Health is not a mobile user-notification job.

## Recommended n8n implementation

1. Create one encrypted header/bearer credential for `AUTOMATION_WORKER_SECRET`.
2. Run claim every five minutes. Treat an empty array as success.
3. Split `jobs` into items. Keep `id` and `leaseId` paired in each item.
4. Fetch each job with its lease header.
5. End items whose action is `skip`.
6. For `morning_brief` and `evening_summary`, send only the structured `payload` to Gemini with a
   prompt reviewed against the missing revised guides once they are available.
7. Validate model output in n8n for a non-empty title/body and a known GoHa-relative URL. GoHa is
   still the final validator.
8. Call `complete` with `deliver`. On any Gemini error or invalid model output, call `complete`
   with `use_fallback`.
9. Use `fail` only for a workflow failure that prevents completion before delivery starts.
10. On `202`, stop that item. A later claim poll owns the retry.
11. On `404` or `409`, stop that item. Never reuse or fabricate a lease.
12. Alert the owner through the existing infrastructure-email path for repeated `500` responses,
    worker-auth failures, or terminal job failures. Do not include secrets, payloads, or endpoint
    URLs in alerts.

## Deployment verification

Before enabling the n8n schedule:

1. Confirm the database hostname/name and role with the read-only diagnostic.
2. Apply `0016_famous_joseph.sql` once through the repository migration command.
3. Deploy with all four server variables configured.
4. On a real supported iPhone, add GoHa to the Home Screen, enable notifications from an explicit
   button tap, and send the Settings test notification.
5. Repeat with two accounts and two devices. Verify a test for one account never reaches the other.
6. Enable one morning preference with a saved time, poll claim, and inspect the leased payload.
7. Complete with `use_fallback` before testing Gemini.
8. Verify a second claim does not reproduce the completed key.
9. Verify Sabbath suppression and a non-Asia/Manila timezone with controlled saved times.
10. Keep graveyard, review, and streak worker branches disabled until their documented gaps are
    resolved.
