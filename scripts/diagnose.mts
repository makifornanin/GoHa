import { neon } from "@neondatabase/serverless";

import { loadEnv, requireEnv } from "./lib/env.mts";

/**
 * Read-only database diagnostic. Reports connection identity, applied
 * migrations, table inventory, and row counts so we can tell whether a
 * reported "nothing saved" symptom is a database problem or a UI problem.
 * Never prints the connection secret.
 *
 * Run: pnpm db:diagnose
 *
 * STRUCTURAL OUTPUT ONLY (audit R-21). This used to print the owner's email
 * and display name, every recent task title, and the first 60 characters of
 * brain dump entries. A diagnostic exists to be pasted into a chat, an issue
 * or a screenshot, which made it the single most likely route for private
 * content to leave the machine. None of that content was ever load-bearing:
 * the question this script answers is "is the row there, on the right date,
 * pointing at the right parent", and shapes answer that as well as text does.
 *
 * The redaction helpers below keep just enough to recognise a record (its id
 * prefix, its length, its dates) without reproducing what it says.
 */

/** `mark@example.com` -> `m***@e***.com`. Enough to tell two accounts apart. */
function maskEmail(value: unknown): string {
  const email = String(value ?? "");
  const at = email.indexOf("@");
  if (at < 1) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local[0]}***@${domain[0]}***${tld}`;
}

/** First 8 characters of a UUID: enough to correlate rows across sections. */
function shortId(value: unknown): string {
  return `${String(value ?? "").slice(0, 8)}...`;
}

/** Replaces free text with its shape. */
function textShape(value: unknown): string {
  const text = String(value ?? "");
  return `(${text.length} chars)`;
}

loadEnv();

const url = requireEnv("DATABASE_URL");

// Identity only, never the password.
const parsed = new URL(url);
console.log("=== CONNECTION ===");
console.log("host:    ", parsed.hostname);
console.log("database:", parsed.pathname.slice(1));
console.log("role:    ", parsed.username);
console.log("BETTER_AUTH_URL:", process.env.BETTER_AUTH_URL ?? "(not set)");
console.log("BETTER_AUTH_SECRET:", process.env.BETTER_AUTH_SECRET ? "(set)" : "(NOT SET)");

const sql = neon(url);

console.log("\n=== PRIVILEGES ===");
const priv = await sql`
  select current_user,
         has_database_privilege(current_database(), 'CREATE') as db_create,
         has_schema_privilege('public', 'CREATE') as schema_create,
         has_table_privilege('tasks', 'INSERT') as tasks_insert,
         has_table_privilege('tasks', 'SELECT') as tasks_select
`;
console.log(priv[0]);

console.log("\n=== APPLIED MIGRATIONS ===");
try {
  const migrations = await sql`
    select id, hash, created_at from drizzle.__drizzle_migrations order by created_at
  `;
  console.log(`${migrations.length} applied`);
  for (const m of migrations) {
    console.log(`  #${m.id} ${new Date(Number(m.created_at)).toISOString()}`);
  }
} catch (error) {
  console.log("could not read drizzle.__drizzle_migrations:", (error as Error).message);
}

console.log("\n=== TABLES + ROW COUNTS ===");
const tables = await sql`
  select tablename from pg_tables where schemaname = 'public' order by tablename
`;
for (const t of tables) {
  const name = t.tablename as string;
  const rows = await sql.query(`select count(*)::int as n from "${name}"`);
  console.log(`  ${name.padEnd(24)} ${rows[0].n}`);
}

console.log("\n=== SAMPLE DATA ===");
const users = await sql`select id, email, name, created_at from "user" order by created_at limit 5`;
console.log("users:", users.length === 0 ? "(NONE - no owner account!)" : "");
for (const u of users) {
  console.log(`  ${maskEmail(u.email)}  name=${textShape(u.name)}  id=${shortId(u.id)}`);
}

const settings = await sql`select user_id, theme, timezone, week_starts_on from user_settings`;
console.log("\nuser_settings:");
for (const s of settings) {
  console.log(`  theme=${s.theme} tz=${s.timezone} weekStart=${s.week_starts_on}`);
}

const tasks = await sql`
  select id, title, status, priority, scheduled_for, due_at, goal_id, life_area_id, created_at
  from tasks order by created_at desc limit 20
`;
console.log(`\ntasks (${tasks.length}):`);
for (const t of tasks) {
  // Title deliberately reduced to its length: the diagnostic value here is the
  // dates and the parent links, never the wording.
  console.log(
    `  [${t.status}/${t.priority}] id=${shortId(t.id)} title=${textShape(t.title)}\n` +
      `      scheduled_for=${t.scheduled_for ?? "NULL"}  due_at=${t.due_at ?? "NULL"}\n` +
      `      goal=${t.goal_id ? shortId(t.goal_id) : "-"} area=${t.life_area_id ? shortId(t.life_area_id) : "-"}  created=${t.created_at}`,
  );
}

const prios = await sql`select id, task_id, priority_date, created_at from daily_priorities`;
console.log(`\ndaily_priorities (${prios.length}):`);
for (const p of prios) {
  console.log(`  date=${p.priority_date} task=${p.task_id ? shortId(p.task_id) : "(label)"}`);
}

const dumps = await sql`select id, content, status from brain_dump_items limit 5`;
console.log(`\nbrain_dump_items (${dumps.length}):`);
for (const d of dumps) console.log(`  [${d.status}] id=${shortId(d.id)} content=${textShape(d.content)}`);

const focus = await sql`select id, status, started_at, ended_at, duration_seconds from focus_sessions limit 5`;
console.log(`\nfocus_sessions (${focus.length}):`);
for (const f of focus) {
  console.log(`  [${f.status}] started=${f.started_at} ended=${f.ended_at ?? "NULL"} dur=${f.duration_seconds ?? "-"}`);
}

const sessions = await sql`select count(*)::int as n from "session"`;
console.log("\nauth sessions:", sessions[0].n);

console.log("\n=== REFERENTIAL INTEGRITY ===");
const orphanPrios = await sql`
  select p.id, p.task_id from daily_priorities p
  left join tasks t on t.id = p.task_id
  where p.task_id is not null and t.id is null
`;
console.log(
  orphanPrios.length === 0
    ? "  daily_priorities -> tasks: OK"
    : `  *** ${orphanPrios.length} ORPHANED daily_priorities ***`,
);

const orphanEntries = await sql`
  select e.id from habit_entries e
  left join habits h on h.id = e.habit_id
  where h.id is null
`;
console.log(
  orphanEntries.length === 0
    ? "  habit_entries -> habits: OK"
    : `  *** ${orphanEntries.length} ORPHANED habit_entries ***`,
);

console.log("\n=== VISIBILITY CHECK (why a task may look 'missing') ===");
const undated = await sql`
  select count(*)::int as n from tasks
  where scheduled_for is null and due_at is null
    and status in ('todo','in_progress')
`;
console.log(
  `  ${undated[0].n} active task(s) have NO date -> they appear ONLY in the Tasks page "Inbox" / "All" views,\n` +
    "  never on the Today dashboard and never in the default 'Today' task view.",
);

console.log("\n=== SERVER 'TODAY' (Asia/Manila) ===");
const nowRow = await sql`
  select now() as utc_now,
         to_char((now() at time zone 'Asia/Manila')::date, 'YYYY-MM-DD') as manila_today
`;
console.log(nowRow[0]);
