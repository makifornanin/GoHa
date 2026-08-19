# DEPLOY.md - GoHa on Vercel

This is the current deployment sequence for the multi-account PWA/Web Push
architecture. It does not apply migrations automatically and never uses the
owner database for destructive tests.

## Current database state

The 2026-08-18 read-only diagnostic verified the configured Neon target as
`neondb` under the owner role, with three user rows and migrations `0000` through
`0015` applied. Migration `0014_bent_shiver_man.sql` already dropped the old
`user_single_owner_uq` index. The final schema supports multiple accounts.

The new additive migration is:

```text
db/migrations/0016_famous_joseph.sql
```

It creates push subscriptions, pairing sessions, per-device delivery state,
durable worker jobs, and their enums/indexes/constraints. It has been generated,
reviewed, and checked, but was intentionally not applied by the implementation
session.

Before applying it:

```powershell
pnpm db:diagnose
pnpm db:backup
pnpm db:migrate
pnpm db:diagnose
```

Read the diagnostic target before continuing. Do not use `pnpm db:push`, do not
rewrite an older migration, and do not point Playwright/account-reset commands at
the owner database.

## Required server environment

Set these for local development in `.env.local` and in Vercel for Production:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon owner connection used by the app and migrations |
| `BETTER_AUTH_SECRET` | Better Auth session signing secret |
| `BETTER_AUTH_URL` | Exact public application origin |
| `VAPID_PUBLIC_KEY` | Stable Web Push public key |
| `VAPID_PRIVATE_KEY` | Stable server-only Web Push private key |
| `VAPID_SUBJECT` | `mailto:` or HTTPS operations contact |
| `AUTOMATION_WORKER_SECRET` | High-entropy central n8n service credential |

Never use `NEXT_PUBLIC_` for a private value. Do not deploy
`E2E_DATABASE_URL`. Keep the worker secret in n8n's encrypted credential store,
not in workflow JSON or a node body.

Generate VAPID keys locally if needed:

```powershell
pnpm exec web-push generate-vapid-keys --json
```

Copy the values directly into secret stores. Do not paste real values into docs,
source, screenshots, issue trackers, or chat.

## Vercel deployment

1. Import the repository in Vercel.
2. Use Node 22.x, matching `.nvmrc`.
3. Configure the seven Production variables above.
4. Keep `BETTER_AUTH_URL` equal to the final HTTPS origin. Better Auth rejects a
   mismatched preview origin by design.
5. Deploy only after migration 0016 is applied to the intended database.
6. Confirm bare `GET /api/health` returns `200 {"status":"ok"}`.
7. Sign in as `milcamark7@gmail.com` and confirm Settings shows both
   **Connect your iPhone** and the existing advanced **Automations** card.
8. Sign in as a normal account and confirm it sees only the consumer connection
   experience, not token scopes/history.

The repository security headers explicitly serve `/sw.js` as JavaScript with
no-cache headers. The manifest and static icons are public assets; the
authenticated application remains protected.

## iPhone device verification

Web Push cannot be fully verified in jsdom or on an ordinary desktop tab. Use a
supported real iPhone/iPad and the deployed HTTPS origin:

1. Open GoHa in Safari.
2. Use Share -> Add to Home Screen and keep **Open as Web App** enabled.
3. Open GoHa from the new Home Screen icon.
4. Sign in if iOS did not carry the Safari session into the installed app.
5. Open Settings -> Connect your iPhone.
6. Tap **Enable Notifications**, then tap **Allow** in the system prompt.
7. Confirm Settings reports the current device as connected.
8. Tap **Send Test Notification** and verify the visible notification opens
   `/today`.
9. Disconnect the current device and verify other connected devices remain.

For the desktop-to-phone flow, create the QR on the desktop, scan it with the
iPhone Camera, authenticate with the same GoHa account, install/open the Home
Screen app, and explicitly enable notifications. Scanning alone is not a
connection.

## n8n deployment

n8n is central and server-driven. A phone no longer calls n8n and ordinary users
do not configure their own workflows or tokens.

Implement the contract in `docs/n8n-web-push-contracts.md`:

```text
n8n schedule
  -> POST /api/internal/automation/jobs/claim
  -> GET the leased payload
  -> optional Gemini narration
  -> POST complete (or deterministic fallback)
  -> GoHa Web Push fan-out
```

Start with `outcome: "use_fallback"` before adding Gemini. Keep user IDs, local
dates, timezones, dedupe keys, deep links, and push endpoints under GoHa control.

Active central kinds are morning, evening, deadline, focus overrun, and the
morning Sabbath rest message. Streak, graveyard, and review materialization must
remain disabled until the limitations in
`docs/PWA_WEB_PUSH_AUTOMATION_REVISION.md` are resolved.

## Validation before scheduled delivery

1. Test two accounts and at least two subscriptions.
2. Prove one account's test push cannot reach the other.
3. Save explicit planning/reflection times; null means the related daily job is
   intentionally unscheduled.
4. Poll claim and complete one fallback notification.
5. Poll again and verify the completed key is not reproduced.
6. Verify a non-Manila timezone and a DST boundary.
7. Verify Sabbath suppresses evening/deadline/focus and produces at most one
   enabled morning rest message.
8. Keep infrastructure health alerts on the existing email path.

## Operational notes

- Keep the VAPID key pair stable. Replacing it can require resubscription.
- A provider 404/410 removes only that dead subscription.
- Per-device ledgers avoid resending to devices already accepted during a
  partial retry, but Web Push cannot promise transactional exactly-once receipt.
- The service worker is push-only; there is no offline cache.
- Existing personal automation tokens and APIs remain available for explicit
  developer integrations. They are not PWA device credentials.
