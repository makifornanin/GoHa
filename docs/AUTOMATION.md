# AUTOMATION.md — the surface GoHa exposes

GoHa contains no notification infrastructure, no scheduler, and no third-party
integrations. That is written into the project constitution (CLAUDE.md section
2), and it does not change here. What this document describes is the small,
token-authenticated, read-mostly surface that lets something **outside** GoHa
read your day: n8n, Make, Apple Shortcuts, a Scriptable widget, a push service
like Pushcut.

The companion `docs/GoHa-Automation-Guide.pdf` covers the other side of the
wire: which tools to use, what to build first, and the operating rules. This
file covers only what the app itself offers.

---

## Why an API and not a database role

The guide's phase 0 hands automations a read-only Postgres role, and for plain
questions ("which tasks are late") that works. It cannot answer the question
that matters most: **what should I start with?** That judgement lives in
`lib/today-brain.ts`, it is real code, and reimplementing it in SQL guarantees
the two drift apart the first time the ranking improves.

So the app grows one endpoint that runs the actual engine, and the notification
says what the app says, because it is the same code.

A read-only database role is still the right tool for bulk history queries. Use
both; keep the role `SELECT`-only, so no automation can write around the app's
validation and ownership checks.

---

## Getting a token

Settings -> Automations -> New token.

- The secret is shown **once**. Only a SHA-256 hash of it is stored, so there is
  no copy to come back for. Lost token, new token.
- Choose the scope in plain terms: read only, or read plus recording
  deliveries. Neither can create, complete, or reschedule anything.
- Set an expiry if the token lives somewhere you do not fully control.
- Revoke stops it working immediately and keeps its request history. Delete
  removes the row.

Store it in your automation platform's credential store. Never in a node body,
a query string, or a screenshot.

---

## Calling it

```bash
curl -s https://<your-goha-host>/api/automation \
  -H "Authorization: Bearer $GOHA_TOKEN"
```

Rules the surface enforces:

| Rule | What happens if you break it |
| --- | --- |
| Bearer token in the `Authorization` header | No header, or a token in a query string: `401` |
| Token must be live | Unknown, revoked, or expired: `401`, all three identical |
| Scope must cover the call | Read-only token posting a delivery: `403` |
| 60 requests per minute per token | `429` with `Retry-After` |
| Identity comes from the token | There is no `user_id` parameter anywhere to forge |

`503` means the app could not verify the token at all (database unreachable, or
the automation tables not migrated yet). Retry; do not treat it as a bad
credential.

Every call is logged with its route and status, and shows up in Settings ->
Automations. That log is also what the rate limiter counts, so it holds even if
the app runs as more than one instance.

---

## Endpoints

### `GET /api/automation`

Does this token work, and what can it reach. Use it once when wiring things up,
and as the health check of your workflow.

### `GET /api/automation/brief`

The day's brief: exactly the judgement the Today screen shows.

```jsonc
{
  "date": "2026-08-17",
  "timeZone": "Asia/Manila",
  "generatedAt": "2026-08-16T23:30:00.000Z",
  "state": "late",                  // late | focus | plan | clear | done
  "headline": "2 things have slipped",
  "detail": "Start with \"Draft the proposal\" — 3 days late.",
  "lateCount": 2,
  "completedToday": 1,
  "totalToday": 4,
  "habitsRemaining": 1,
  "canReflect": false,
  "task": {
    "id": "…",
    "title": "Draft the proposal",
    "priority": "high",
    "daysLate": 3,
    "focusPath": "/focus?taskId=…",  // a real deep link: Focus preselects it
    "reason": ""
  },
  "suggestions": [ /* same shape, each with the app's stated reason */ ],
  "quiet": false
}
```

`quiet` is the field to branch on. It is true when there is genuinely nothing to
act on, and the first operating rule is never to notify when there is nothing to
act on. Let the app make that call, so every flow makes it the same way.

### `GET /api/automation/habits`

What is still open today, and which streaks are at risk.

```jsonc
{
  "date": "2026-08-17",
  "scheduledToday": 3,
  "doneToday": 1,
  "due": [
    { "id": "…", "name": "Read", "state": "pending", "currentStreak": 12,
      "streakAtRisk": true, "targetValue": null, "unit": null }
  ],
  "atRisk": [ /* the subset with a streak of 3 or more */ ],
  "quiet": false
}
```

Enough for both habit automations in the guide: the evening check that stays
silent unless something is unchecked (`quiet`), and the streak rescue that only
speaks when a real streak is about to end (`atRisk`).

A deliberately skipped habit never appears. A skip is a decision that has
already been made; chasing it is arguing with the owner.

### `POST /api/automation/deliveries` (scope: read and write)

Claim a notification once per `(kind, local date)`. This is how a flow that runs
twice sends once.

```bash
curl -s -X POST https://<host>/api/automation/deliveries \
  -H "Authorization: Bearer $GOHA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kind":"morning-brief","detail":"3 late"}'
```

```jsonc
// 201: you are first. Send it.
{ "claimed": true, "kind": "morning-brief", "date": "2026-08-17" }

// 200: someone already did. Send nothing.
{ "claimed": false, "kind": "morning-brief", "date": "2026-08-17",
  "sentAt": "2026-08-16T23:30:11.482Z", "detail": "3 late" }
```

`date` defaults to **your** local today, resolved from the timezone saved in
Settings, not from the caller's clock. An automation platform running in UTC
would otherwise claim tomorrow eight hours early.

`kind` is lowercased and must be a slug (`morning-brief`, not `Morning Brief`),
so two spellings cannot both believe they are first.

The unique constraint behind this is what makes it a claim rather than a hope.
Two flows firing together: one gets `claimed: true`, the other `false`.

---

## What this surface deliberately does not do

- **No writes to your work.** Nothing here can create a task, complete a habit,
  or move a date. Those stay behind the app's Server Actions, where Zod
  validation, ownership checks and revalidation live. An automation writing
  straight to Postgres bypasses all of it and can produce rows the app considers
  impossible.
- **No export.** The nightly backup the guide recommends is `pnpm db:backup`
  (all 19 tables, no caps, verified by `pnpm db:restore-check`). Publishing the
  whole database behind an HTTP token would widen this surface for something a
  script already does better.
- **No delivery.** GoHa never sends anything. It answers questions.

---

## If you are wiring this up for the first time

1. Test your push channel before anything else (guide, phase 0.3). A working
   webhook first makes everything after it debuggable.
2. Create a read-only token and call `GET /api/automation` from a terminal.
3. Build one flow: cron -> `GET /api/automation/brief` -> stop if `quiet` ->
   format -> push.
4. Live with it for a week before building the second one. Whether you actually
   read it should decide what comes next, far more than any list.
