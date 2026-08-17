# DEPLOY.md — putting GoHa on Vercel

Written to be followed once. Everything the app can prepare is prepared; what
remains needs your account, and is listed here in order.

---

## Before you deploy

**1. Settle the second account.** `e2e.harness@goha.test` exists on the
production database alongside your own. It blocks migration 0011 (the
single-owner index), and deploying with it live puts a second account, whose
password is in this repository, on the public internet.

```sql
-- What each account owns, before you decide.
SELECT u.email, count(t.id) AS tasks
FROM "user" u LEFT JOIN tasks t ON t.user_id = u.id
GROUP BY u.email;
```

Then either delete the harness account (its rows cascade) or keep it and skip
the singleton index. Do not deploy with it live.

**2. Apply the migrations.** Both are generated, read, and committed; neither
has been applied.

```bash
pnpm db:backup      # first, always
# run the five preflight queries in DATABASE.md, each must return no rows
pnpm db:migrate     # applies 0011 then 0012
pnpm db:diagnose    # confirms both landed
```

---

## Deploying

1. **Import the repository** at vercel.com/new. The framework is detected;
   `vercel.json` pins the region to Singapore (`sin1`), which is where the Neon
   database lives. A different region means every query crosses an ocean twice.

2. **Set Node to 22.x** in Project Settings → General, matching `.nvmrc`.

3. **Environment variables**, Production scope only:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | The `neondb_owner` connection string, same database |
   | `BETTER_AUTH_SECRET` | Your existing value, or `openssl rand -base64 32` |
   | `BETTER_AUTH_URL` | The production origin, e.g. `https://goha.vercel.app` |

   Do **not** add `E2E_DATABASE_URL`. It exists to point destructive tooling at
   a throwaway database and has no business on a server.

4. **Deploy**, then sign in and confirm `/api/health` returns
   `{"status":"ok"}`.

---

## Two things that will bite otherwise

**`BETTER_AUTH_URL` and preview deployments.** Better Auth validates the request
Origin against it, so every preview URL rejects sign-in. Set the variable for
Production only and expect previews to fail at login. That is it working, not a
bug.

**Your password is now the only lock.** Registration is closed and (after 0011)
the database refuses a second account, but `/login` is public. Use a real
password. Vercel's deployment protection is one toggle if you want a second
layer.

---

## After deploying

1. **Settings → Automations → New token.** The QR code carries the production
   URL, because the page reads it from the request rather than an env var. A
   token created locally shows a `localhost` address and the card says so.
2. Point n8n at the production origin and store the token as a Header Auth
   credential.
3. Turn on the automations you want in **Settings → What automations may send**.
   All three ship off, and the API enforces them.
4. Set your **Sabbath day** in the same card if you keep one.
5. Seed the quote pool if you want the card and the brief to carry one:
   create `content/daily-quotes.json`, then `pnpm db:seed-quotes`.

---

## What runs where

| | Where | Notes |
| --- | --- | --- |
| GoHa | Vercel | Serverless; the Neon HTTP driver suits it |
| Database | Neon | Unchanged; same project, same connection string |
| n8n | Yours to host | Must be reachable **from your phone**, since Shortcuts POST to its webhooks |
| Shortcuts | iPhone | Pull only; iOS may defer a timed automation under Low Power Mode |
| AI, Gmail | n8n credentials | Never in GoHa; nothing here calls a model |

CI runs typecheck, lint, unit tests, a production build, and a migration-drift
check on every push. It holds no credentials and never touches a database.
