# AUTOMATION.md — the surface GoHa exposes

GoHa contains no notification infrastructure, no scheduler, and no third-party
integrations. That is in the project constitution (CLAUDE.md section 2) and does
not change here. What follows is the small, token-authenticated surface that
lets something **outside** GoHa read your day and say something about it: n8n,
Apple Shortcuts, a Scriptable widget.

This file is the app side. The eight `GoHa-Guide-*.pdf` documents in this folder
are the other side of the wire: the workflows, the prompts, the Shortcuts.

---

## Why an API and not a database role

A read-only Postgres role answers plain questions ("which tasks are late") and
cannot answer the one that matters: **what should I start with?** That judgement
lives in `lib/today-brain.ts`, it is real code, and a SQL reimplementation
drifts from the app the first time the ranking improves.

So the automations call the actual engine. The notification says what the app
says, because it is the same function.

Keep a `SELECT`-only role for bulk history queries and backups. Every write goes
through these endpoints, where Zod validation and ownership checks live.

---

## Getting a token

**Settings → Automations → New token.**

- The secret appears **once**. Only its SHA-256 hash is stored, so there is no
  copy to come back for.
- A **QR code** is shown with it, carrying `{ url, token }`. Point your phone's
  camera at the screen instead of typing 45 characters.
- Scope in plain terms: read only, or read plus writes. Neither can create,
  complete, or reschedule anything.
- Revoke stops it immediately and keeps its history. Delete removes the row.

Store it in n8n's credential store as a Header Auth credential. Never in a node
body, a query string, or a screenshot.

---

## The rules this surface keeps

| Rule | If you break it |
| --- | --- |
| Bearer token in the `Authorization` header | `401`. A token in a query string is never read |
| Token must be live | Unknown, revoked and expired are one identical `401` |
| Scope must cover the call | Read-only token posting: `403` |
| 60 requests per minute per token | `429` with `Retry-After` |
| Identity comes from the token | There is no `userId` parameter anywhere to forge |

`503` means the app could not verify the token at all (database unreachable, or
the automation tables not migrated). Retry; it is not a bad credential.

Every response to a live token carries the day's envelope, which is what
`goha-lib-guard` reads:

```jsonc
{ "localDate": "2026-08-18", "timezone": "Asia/Manila", "isSabbath": false }
```

Every call is logged with route and status and appears in Settings. That log is
also what the rate limiter counts, so the limit holds across instances.

---

## Endpoints

| Method | Path | Scope | Serves |
| --- | --- | --- | --- |
| GET | `/api/health` | none / read | Liveness; with a token, a database probe |
| GET | `/api/automation` | read | Does this token work, and what can it reach |
| GET | `/api/automation/quote/today` | read | The day's quote, and the context envelope |
| GET | `/api/automation/brief/morning` | read | The ranked morning payload |
| GET | `/api/automation/brief/evening` | read | How the day actually went |
| GET | `/api/automation/due?window=N&evening=true` | read | Deadlines, overdue, focus overrun, streaks |
| GET | `/api/automation/graveyard` | read | Work that has stopped moving |
| GET | `/api/automation/review/week-stats?week=` | read | The week's numbers, as Review derives them |
| POST | `/api/automation/review/draft` | read_write | Draft into EMPTY review fields only |
| POST | `/api/automation/log` | read_write | Claim a dedupe key; `201` or `409` |
| POST | `/api/automation/brain-dump` | read_write | Capture a thought into the inbox |

### `/api/health` has two levels

Unauthenticated it returns `200 {"status":"ok"}` and nothing else, which is safe
to hand to any uptime service. With a token it adds `db`, `latencyMs`, `version`
and `time`.

**It answers 200 even when the database is down**, with `db: "fail"` and
`status: "degraded"`. That is deliberate and Guide 04's classifier depends on
it: a non-200 means DOWN (nothing answered at all), while 200 with `db: "fail"`
means DEGRADED (the app is up, its database is not). Those need different
emails. The probe times out after 3 seconds so a hanging connection cannot hang
the check.

### The morning brief

`quiet` is the field to branch on: true when there is genuinely nothing to act
on. Never notifying when there is nothing to say is the first operating rule,
and it is decided server-side so every flow decides it the same way.

`tasks.overdue` is **never truncated**. A cap would be data truncation, and no
downstream step could put back what the API had stopped knowing. If naming every
overdue title makes the notification too long, state the exact count and append
"+N more" — that is display overflow handling, not forgetting.

`alreadyDelivered` reflects `brief:morning:{localDate}` in the log, so a re-run
can re-serve rather than recompose.

On the Sabbath this serves `{ sabbath: true, message, quote }` and no task
content at all.

### `/api/automation/due`

Every item arrives with a **server-computed `dedupeKey`**. Claim it through
`/log` before sending; items already claimed never appear, so two polls back to
back produce one alert between them.

```
deadline:{taskId}:{dueAtIso}    rescheduling changes the key, so it re-arms
focus:{sessionId}:overrun       one nudge per session, not one per poll
streak:{habitId}:{localDate}    one per habit per day, evening poll only
```

`window` is in minutes (5..1440), defaulting to your saved
`deadlineLeadMinutes`. `evening=true` adds the streak section.

### `/api/automation/log`

```bash
curl -s -X POST https://<host>/api/automation/log \
  -H "Authorization: Bearer $GOHA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kind":"morning_brief","dedupeKey":"brief:morning:2026-08-18","payload":{"...":"..."}}'
```

`201 { claimed: true }` — you are first, send it.
`409 { claimed: false, payload }` — someone already did; the winner's payload
comes back so a re-run re-serves it rather than writing a second version.

Store real structure in `payload`. The graveyard sweep reads prior payloads back
to count repeat appearances **by task id**, so include `taskIds`.

### `/api/automation/review/draft`

Writes only into fields that are currently **empty**, never `completedAt`, never
`rating`, and prefixes each drafted field with `[AI draft] ` so authorship is
visible. A completed review is skipped entirely. The response says which fields
were written and which were skipped.

---

## Switches that actually switch

Settings → "What automations may send". All three default to **off**.

| Setting | Effect |
| --- | --- |
| `morningBriefEnabled` | Off: `/brief/morning` returns a silent response |
| `eveningSummaryEnabled` | Off: `/brief/evening` is silent |
| `deadlineAlertsEnabled` | Off: `/due` returns no items |
| `sabbathDay` | On that weekday, work endpoints return `{ sabbath: true, items: [] }` |
| `quoteSourcePref` | Which pool the daily quote is drawn from |
| `deadlineLeadMinutes` | Default `window` for `/due` |

Enforced by the API, not by the workflows. A switch that only works if some flow
remembers to check it is decoration.

The Sabbath gate is server-side and applies once, so a forgotten IF node in a
future workflow cannot leak a deadline alert onto your rest day. Exempt:
`/api/health` (infrastructure failure does not keep a rest day),
`/quote/today` (the rest verse is the one thing still being said), and
`/brain-dump` (capturing a thought is not work; losing one is).

**The data does not rest, only the messaging does.** Streaks, overdue maths and
every derivation carry on unchanged.

---

## The quote pool

`daily_quotes` ships **empty**, and that is a working state: the Today card
shows its empty message and the endpoints return `quote: null`.

To fill it, create `content/daily-quotes.json` and run `pnpm db:seed-quotes`.
The loader is idempotent (upsert on source + text) and writes `verified: false`
for everything, always, with no flag to change that. A verse with a word wrong
is a wrong verse; confirming wording against a real source is a human act.

Use a public-domain translation you can check (WEB, KJV) or an edition you own.
Include 30 or more entries tagged `"theme": "rest"` if you use a Sabbath day.

---

## What this surface will not do

- **No bulk writes to your work.** Nothing can complete a habit, move a date, or
  cancel a task. The graveyard digest recommends; you decide.
- **No export.** The backup is `pnpm db:backup` (every table, no caps, verified
  by `pnpm db:restore-check`), which does that job better without publishing the
  whole database behind an HTTP token.
- **No delivery.** GoHa never sends anything. It answers questions.
