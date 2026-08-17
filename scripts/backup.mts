import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";

import { BACKUP_FORMAT, BACKUP_TABLES } from "./lib/backup-tables.mts";

/**
 * The real backup (audit R-04).
 *
 * The Settings "export my data" action is a convenience copy for the owner: it
 * skips task map nodes and edges, daily priorities, goal progress history,
 * in-progress focus sessions, inactive habit schedules, and anything outside
 * its hard caps and date ranges. It also has no counterpart that can put the
 * data back. It is a useful thing to hand yourself; it is not a backup.
 *
 * This script captures ALL 19 tables with no caps, no ranges and no filters,
 * in dependency order, to a timestamped file under ./backups.
 *
 *   pnpm db:backup                 -> pg_dump if available, else JSON
 *   pnpm db:backup -- --json       -> force the JSON driver path
 *   pnpm db:restore-check <file>   -> validate a dump before trusting it
 *
 * READ ONLY. It issues SELECTs and nothing else, so it is deliberately NOT
 * behind the test-database guard: the whole point is to run it against the
 * real database.
 *
 * The output contains password hashes and session tokens. Treat a dump file
 * exactly like a secret: ./backups is gitignored, and it should never be
 * pasted, attached or synced anywhere you would not put the database itself.
 */
function loadEnv(file: string): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set; cannot back up.");

/** Filesystem-safe UTC stamp: 2026-08-17T14-32-05Z. */
function stamp(now = new Date()): string {
  return now.toISOString().replace(/:/g, "-").replace(/\.\d{3}/, "");
}

const outDir = resolve(process.cwd(), "backups");
mkdirSync(outDir, { recursive: true });

const forceJson = process.argv.includes("--json");

/** Is a real pg_dump on PATH? */
function hasPgDump(): boolean {
  try {
    const probe = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
    return probe.status === 0;
  } catch {
    return false;
  }
}

if (!forceJson && hasPgDump()) {
  const file = resolve(outDir, `goha-${stamp()}.dump`);
  console.log("pg_dump found; taking a native custom-format dump.");
  // --format=custom so pg_restore can do selective restores later.
  // The URL is passed as an argument, not echoed.
  const run = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", file, url], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (run.status !== 0) {
    throw new Error(`pg_dump exited with status ${run.status}. No backup was written.`);
  }
  console.log(`\nWrote ${file}`);
  console.log("Validate it with: pg_restore --list <file>");
} else {
  console.log(
    forceJson
      ? "Taking a JSON dump (--json requested)."
      : "pg_dump not found on PATH; falling back to a per-table JSON dump.",
  );

  const sql = neon(url);
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    // Table names come from the frozen constant above, never from input.
    const rows = await sql.query(`select * from "${table}"`);
    tables[table] = rows;
    counts[table] = rows.length;
    console.log(`  ${table.padEnd(24)} ${rows.length}`);
  }

  const payload = {
    format: BACKUP_FORMAT,
    generatedAt: new Date().toISOString(),
    tableOrder: BACKUP_TABLES,
    counts,
    tables,
  };

  const file = resolve(outDir, `goha-${stamp()}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.log(`\nWrote ${file}`);
  console.log(`${total} row(s) across ${BACKUP_TABLES.length} tables.`);
  console.log("Validate it with: pnpm db:restore-check <file>");
}
