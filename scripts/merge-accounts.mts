import { neon } from "@neondatabase/serverless";

import { loadEnv, requireEnv } from "./lib/env.mts";

/**
 * Merge two owner accounts into one.
 *
 * GoHa is single-owner, and migration 0011 enforces that with a unique index
 * over the whole `user` table. This database has two rows: an account created
 * at setup, and the E2E harness account, which is the one that has actually
 * been used. The harness account holds real life areas, goals and habits, so
 * "delete the test account" would take real content with it.
 *
 * This moves every row from one account to the other, then deletes the emptied
 * account. Nothing is thrown away except rows that would collide, and each of
 * those is reported rather than silently dropped.
 *
 * DRY RUN BY DEFAULT. Pass --commit to write.
 *
 *   pnpm db:merge-accounts --from <email> --to <email>
 *   pnpm db:merge-accounts --from <email> --to <email> --commit
 *
 * Take a backup first (`pnpm db:backup`). This script does not take one for
 * you, because a backup you did not choose to take is one you will not
 * remember to look for.
 */

loadEnv();
const sql = neon(requireEnv("DATABASE_URL"));

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const valueOf = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

// Accounts may be named by email or by id. Ids exist because an email is a
// private value and this command ends up in shell history and screenshots.
const fromRef = valueOf("--from") ?? valueOf("--from-id");
const toRef = valueOf("--to") ?? valueOf("--to-id");

if (!fromRef || !toRef) {
  console.error(
    "Usage: pnpm db:merge-accounts --from <email|id> --to <email|id> [--commit]",
  );
  process.exit(1);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every table carrying `user_id`, in an order that keeps parents before
 * children. Ownership moves wholesale; the rows themselves are untouched.
 */
const OWNED_TABLES = [
  "life_areas",
  "goals",
  "goal_progress_updates",
  "tasks",
  "habits",
  "habit_schedules",
  "habit_entries",
  "focus_sessions",
  "brain_dump_items",
  "daily_priorities",
  "task_maps",
  "task_map_nodes",
  "task_map_edges",
  "weekly_reviews",
] as const;

async function findAccount(ref: string) {
  const rows = UUID.test(ref)
    ? await sql`select id, email, name from "user" where id = ${ref}`
    : await sql`select id, email, name from "user" where email = ${ref}`;
  return rows[0];
}

/** `mark@example.com` -> `m***@example.com`. Enough to tell two accounts apart. */
function mask(email: unknown): string {
  const value = String(email ?? "");
  const at = value.indexOf("@");
  return at < 1 ? "***" : `${value[0]}***${value.slice(at)}`;
}

const from = await findAccount(fromRef);
const to = await findAccount(toRef);

if (!from) throw new Error(`No account matching ${UUID.test(fromRef) ? fromRef : mask(fromRef)}`);
if (!to) throw new Error(`No account matching ${UUID.test(toRef) ? toRef : mask(toRef)}`);
if (from.id === to.id) throw new Error("Both references resolve to the same account.");

const fromEmail = mask(from.email);
const toEmail = mask(to.email);

console.log(`Moving everything owned by ${fromEmail} to ${toEmail}.`);
console.log(commit ? "MODE: commit (writing)\n" : "MODE: dry run (no writes)\n");

let moved = 0;

for (const table of OWNED_TABLES) {
  const [{ n }] = await sql.query(`select count(*)::int as n from "${table}" where user_id = $1`, [
    from.id,
  ]);
  if (n === 0) continue;

  if (commit) {
    await sql.query(`update "${table}" set user_id = $1 where user_id = $2`, [to.id, from.id]);
  }
  console.log(`  ${table.padEnd(22)} ${n}`);
  moved += n;
}

/*
 * Two tables cannot simply move.
 *
 * `user_settings` is unique per user, so the destination already has a row and
 * the source's is dropped: preferences are cheap to restate and impossible to
 * merge meaningfully.
 *
 * `daily_priorities` is unique on (user_id, priority_date, position). A clash
 * means both accounts pinned something to the same slot on the same day; the
 * source's row is dropped and named here, because a pinned priority is a
 * statement of intent and quietly discarding one is worse than saying so.
 */
const clashes = await sql.query(
  `select f.id, f.priority_date, f.position
     from daily_priorities f
     join daily_priorities t
       on t.user_id = $1 and t.priority_date = f.priority_date and t.position = f.position
    where f.user_id = $2`,
  [to.id, from.id],
);

if (clashes.length > 0) {
  console.log(`\n  ${clashes.length} daily priority slot(s) already taken on the destination:`);
  for (const clash of clashes) {
    console.log(`    ${clash.priority_date} slot ${clash.position} (source row dropped)`);
  }
  if (commit) {
    await sql.query(`delete from daily_priorities where id = any($1::uuid[])`, [
      clashes.map((c) => c.id),
    ]);
  }
}

const [{ n: settingsRows }] = await sql.query(
  `select count(*)::int as n from user_settings where user_id = $1`,
  [from.id],
);
if (settingsRows > 0) {
  console.log(`\n  user_settings: ${settingsRows} row dropped (destination keeps its own).`);
  if (commit) {
    await sql.query(`delete from user_settings where user_id = $1`, [from.id]);
  }
}

/*
 * Sessions and credentials are NOT moved. A session belongs to the login it was
 * created by, and moving one would hand the destination account a live session
 * nobody signed in for. Deleting the source account cascades them away, which
 * means whoever was signed in as it gets signed out. That is correct: the
 * account they were using no longer exists.
 */
const [{ n: sessions }] = await sql.query(
  `select count(*)::int as n from "session" where user_id = $1`,
  [from.id],
);
console.log(`\n  ${sessions} session(s) belonging to ${fromEmail} will be signed out.`);

if (commit) {
  await sql`delete from "user" where id = ${from.id}`;
  const [{ n: remaining }] = await sql`select count(*)::int as n from "user"`;
  console.log(`\nDone. ${moved} row(s) moved. ${remaining} account remains.`);
  console.log(
    remaining === 1
      ? "Migration 0011's single-owner index will now apply cleanly."
      : "More than one account remains; 0011 will still fail.",
  );
} else {
  console.log(`\nDry run only. ${moved} row(s) would move, then ${fromEmail} would be deleted.`);
  console.log("Re-run with --commit to write. Take a backup first: pnpm db:backup");
}
