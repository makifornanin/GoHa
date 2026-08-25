# GoHa n8n Email Contracts

Two server-to-server events GoHa sends to n8n so n8n can deliver email through
Gmail. Companion to `docs/n8n-web-push-contracts.md`, which covers the worker
job surface. Nothing here touches the central dispatcher or the worker routes.

## Purpose and trust boundary

GoHa never sends email. It decides that an email is warranted and hands the
facts to n8n; n8n owns wording, templating and Gmail delivery.

| Owned by GoHa | Owned by n8n |
|---|---|
| User identity and account existence | Receiving a trusted event |
| Authentication and password updates | Email presentation and templating |
| Reset token generation, expiry, validation, single use | Gmail delivery |
| The decision that an event should be sent | Optional delivery acknowledgement |
| Idempotency and dedupe | |

Two rules follow, and neither is negotiable:

1. **n8n never generates a password reset token.** Tokens come from Better
   Auth, live in GoHa's `verification` table and are consumed server-side. A
   workflow that minted its own would be minting credentials for accounts.
2. **n8n never determines account existence.** It is not told whether an address
   belongs to an account, and it must never query GoHa to ask. See "Account
   existence" below for why this is load-bearing.

## Endpoint configuration

Two separate webhook URLs, one shared secret. Two URLs rather than one endpoint
with a switch, because each maps to its own n8n workflow with its own template.

| Variable | Purpose |
|---|---|
| `N8N_PASSWORD_RESET_WEBHOOK_URL` | Receives `password_reset_requested` |
| `N8N_WELCOME_EMAIL_WEBHOOK_URL` | Receives `welcome_email` |
| `N8N_EMAIL_WEBHOOK_SECRET` | Bearer credential for both, minimum 32 characters |

All three are server-only and must never be given a `NEXT_PUBLIC_` prefix, which
would inline them into the browser bundle. Set them in Vercel project settings.

Each URL is optional and independent. Leaving one unset disables that event: the
attempt is logged and skipped, and the request that triggered it still succeeds.
The secret is required before either URL is used.

URLs must be `https`, except `http://localhost` and `http://127.0.0.1` for local
development. The secret travels in a header, so a plaintext hop to a remote host
would expose it and is refused at configuration time.

## Authentication

Every request carries the shared secret as a bearer token, matching the
convention on the worker routes:

```http
POST /webhook/goha-password-reset HTTP/1.1
Authorization: Bearer <N8N_EMAIL_WEBHOOK_SECRET>
Content-Type: application/json
x-goha-event-id: 6f1c4a2e-8b7d-4c31-9f0a-2d5e7b8c9a01
```

The workflow MUST reject any request whose bearer token does not match, and
should compare in constant time where the tool allows it. Without that check the
webhook URL alone is enough for anyone to make GoHa appear to send mail.

`x-goha-event-id` repeats the body's `eventId` so a workflow can drop a replay
without parsing the body.

GoHa sends with `redirect: "error"`: a 3xx is treated as a failure rather than
followed, so a misconfigured redirect cannot forward the bearer token or a reset
URL to another host.

Timeout is 10 seconds. There is no retry; see "Failure behavior".

---

## 1. Password reset email

Sent when someone submits the forgot-password form for an address that HAS an
account. Better Auth calls the delivery hook only in that case.

### Request body

```json
{
  "eventType": "password_reset_requested",
  "eventId": "6f1c4a2e-8b7d-4c31-9f0a-2d5e7b8c9a01",
  "recipientEmail": "person@example.com",
  "displayName": "Maki",
  "resetUrl": "https://go-ha.vercel.app/api/auth/reset-password/<token>?callbackURL=%2Freset-password",
  "expiresInMinutes": 60
}
```

### Fields

| Field | Type | Notes |
|---|---|---|
| `eventType` | string | Always `password_reset_requested` |
| `eventId` | string | Opaque UUID, unique per request. Use for dedupe and logging |
| `recipientEmail` | string | The only address this mail may be sent to |
| `displayName` | string or null | Safe to greet with. Null when the account has no name |
| `resetUrl` | string | Put this behind the button, unmodified |
| `expiresInMinutes` | number | Currently 60. Read it, do not hard-code it |

### Token secrecy

`resetUrl` contains a single-use credential. The workflow MUST:

- send it only to `recipientEmail`, never to a fixed or copied address;
- put it in the email body only, never in a log node, a spreadsheet, an error
  notification or an execution note that outlives the email;
- pass it through byte for byte. Appending tracking parameters or wrapping it in
  a click-tracking redirector can invalidate it or leak it to the tracker;
- never store it. GoHa expires it in an hour and consumes it on first use, and
  anything n8n retains outlives both protections.

Executions that carry this payload should have their data retention set as short
as the n8n instance allows, since saved execution data would otherwise hold live
reset links.

### Expected behavior

Respond `2xx` once the mail is accepted for delivery. Any non-2xx is recorded as
a failure by GoHa and no retry follows.

The email should say the link works once and expires in an hour, and should tell
the reader to ignore the message if they did not request it.

### Account existence

The workflow is only invoked for addresses that exist, but it must not turn that
into an observable signal. Concretely, do not send a "no account found" email to
addresses you were not given, do not add an unknown-address branch, and do not
report per-address results to any surface the requester can see.

GoHa's side already holds this line: `/request-password-reset` returns the same
body for known and unknown addresses and performs a dummy lookup so the timing
matches, and the browser shows the same confirmation even when the request
itself fails.

---

## 2. Welcome email

Sent once, when a brand-new account is successfully created. Not on sign-in, not
on session creation, not on a new device.

### Request body

```json
{
  "eventType": "welcome_email",
  "eventId": "b2c9d4e1-3a7f-4c58-8e2b-1f6a9d0c3b74",
  "recipientEmail": "new@example.com",
  "displayName": "Nanin",
  "createdAt": "2026-08-22T04:00:00.000Z"
}
```

### Fields

| Field | Type | Notes |
|---|---|---|
| `eventType` | string | Always `welcome_email` |
| `eventId` | string | Opaque UUID, unique per account |
| `recipientEmail` | string | The new account's own address |
| `displayName` | string or null | Null when the account has no name |
| `createdAt` | string | ISO 8601 instant the event was built |

n8n does NOT need to ask whether this address existed before. GoHa only emits
this event on a sign-up that returned a new user, and guards it with a durable
per-account claim.

### Idempotency

GoHa claims the right to send before dispatching, with a conditional update that
only succeeds while `user_settings.welcome_email_sent_at` is still null. Exactly
one caller can win, so a retried sign-up cannot produce a second email. If the
handoff then fails, the claim is released so a later retry can still welcome the
user.

The workflow should still treat `eventId` as an idempotency key. GoHa's guard
covers its own retries; it cannot cover a duplicate that originates inside n8n,
such as a manually re-run execution.

### Expected behavior

Respond `2xx` once accepted. A non-2xx or a timeout causes GoHa to release the
claim, which means a future sign-up retry for the same account could send again.
This is deliberate: for a welcome message, a small chance of a duplicate is
better than a user who is silently never welcomed.

---

## Failure behavior

There is **no retry and no queue.** A failed handoff means no email is sent.

That is a deliberate trade rather than an omission:

- **Password reset**: retrying is close to worthless. The token expires in an
  hour, and the reader is sitting in front of a form that invites them to ask
  again, which mints a fresh token. A retry queue would also mean holding live
  reset URLs in durable storage, which is exactly what the secrecy rules above
  are trying to avoid.
- **Welcome**: the claim is released on failure, so the next sign-up attempt for
  that account can send. Nothing is permanently lost, and no durable outbox
  infrastructure is added for one message.

What a failure must never do:

- **Surface an internal error to the user.** The sender returns failure as a
  value and never throws. Better Auth also swallows and logs anything the
  delivery hook raises, so both layers hold.
- **Reveal whether the account exists.** The forgot-password screen shows the
  same confirmation for success, for an unknown address, and for a network
  failure. Any error banner that appeared only in some of those cases would be
  the leak.
- **Corrupt the token lifecycle.** The reset token is already written and will
  expire normally whether or not the email goes out. GoHa never deletes it on a
  delivery failure.
- **Fail the request it came from.** A sign-up whose welcome email could not be
  handed off still returns the created account.

Failures are logged with `eventType` and `eventId` only. The reset URL, the
token and the raw error message are deliberately never logged, because a fetch
error message can contain the full request URL and a log is durable in a way a
single-use credential must not be.

## Rate limiting

`/request-password-reset` is rate limited by Better Auth at **3 requests per 60
seconds**, enabled by default in production.

Known limitation, stated plainly: the default counter is in memory, and on
Vercel each serverless instance keeps its own. It stops a naive flood from one
client but not a distributed one. Moving to Better Auth's database-backed
storage would make the limit global and is the natural next step if abuse is
ever observed; it needs a `rateLimit` table and a migration, so it has not been
done pre-emptively.

## Testing without sending real mail

Point the URLs at a request-capture endpoint, or at an n8n workflow whose Gmail
node is disabled, and inspect the payload there. Never point them at a
production workflow while testing.

The unit tests never make a network call: the sender takes its transport as an
injected dependency (`tests/n8n-email-events.test.ts`).

## Related documents

- `docs/n8n-web-push-contracts.md`: worker job surface, push delivery
- `docs/BUILD_PLAN.md`: change log and project rules
