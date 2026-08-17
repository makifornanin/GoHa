import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { BACKUP_FORMAT, BACKUP_TABLES } from "./lib/backup-tables.mts";

/**
 * Validate a dump file WITHOUT touching the database (audit R-04).
 *
 * A backup nobody has ever inspected is a hypothesis, not a backup. This is
 * the cheap half of the drill: it proves the file is complete, well-formed and
 * internally consistent, which catches the common failures (a truncated write,
 * a table that silently returned nothing, a dump taken against an empty
 * database) without needing somewhere to restore to.
 *
 *   pnpm db:restore-check backups/goha-2026-08-17T14-32-05Z.json
 *
 * It never connects to Postgres and never prints row contents.
 */
const target = process.argv[2];
if (!target) {
  console.error("Usage: pnpm db:restore-check <dump-file>");
  process.exit(2);
}

const path = resolve(process.cwd(), target);
if (!existsSync(path)) {
  console.error(`No such file: ${target}`);
  process.exit(2);
}

const bytes = statSync(path).size;
console.log(`File:  ${target}`);
console.log(`Size:  ${(bytes / 1024).toFixed(1)} KiB`);

const problems: string[] = [];
const warnings: string[] = [];

if (path.endsWith(".dump")) {
  // Native pg_dump custom format. Structure is pg_restore's business; all we
  // can honestly assert here is the magic header and a non-trivial size.
  const head = readFileSync(path).subarray(0, 5).toString("latin1");
  if (head !== "PGDMP") {
    problems.push("Not a pg_dump custom-format file (missing PGDMP header).");
  }
  if (bytes < 1024) warnings.push("File is suspiciously small for a full dump.");
  console.log("Type:  pg_dump custom format");
  console.log("\nThis checker validates JSON dumps in depth.");
  console.log("For a native dump, list its contents with: pg_restore --list <file>");
} else {
  console.log("Type:  JSON dump");

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`\nFAIL  File is not valid JSON: ${(error as Error).message}`);
    process.exit(1);
  }

  const dump = parsed as {
    format?: string;
    generatedAt?: string;
    counts?: Record<string, number>;
    tables?: Record<string, unknown[]>;
  };

  if (dump.format !== BACKUP_FORMAT) {
    problems.push(`Unexpected format marker: ${dump.format ?? "(none)"} (want ${BACKUP_FORMAT}).`);
  }
  if (!dump.generatedAt || Number.isNaN(Date.parse(dump.generatedAt))) {
    problems.push("Missing or unparseable generatedAt.");
  } else {
    const ageDays = (Date.now() - Date.parse(dump.generatedAt)) / 86_400_000;
    console.log(`Taken: ${dump.generatedAt} (${ageDays.toFixed(1)} days ago)`);
    if (ageDays > 7) warnings.push(`Dump is ${Math.floor(ageDays)} days old.`);
  }

  const tables = dump.tables ?? {};

  console.log("\nTables:");
  let total = 0;
  for (const name of BACKUP_TABLES) {
    const rows = tables[name];
    if (rows === undefined) {
      problems.push(`Table "${name}" is missing entirely.`);
      console.log(`  ${name.padEnd(24)} MISSING`);
      continue;
    }
    if (!Array.isArray(rows)) {
      problems.push(`Table "${name}" is not an array.`);
      console.log(`  ${name.padEnd(24)} NOT AN ARRAY`);
      continue;
    }
    total += rows.length;
    console.log(`  ${name.padEnd(24)} ${rows.length}`);

    // A declared count that disagrees with the actual array means the file was
    // written from an inconsistent read, or edited by hand.
    const declared = dump.counts?.[name];
    if (declared !== undefined && declared !== rows.length) {
      problems.push(`Table "${name}": counts says ${declared}, array holds ${rows.length}.`);
    }
  }

  const extra = Object.keys(tables).filter(
    (name) => !(BACKUP_TABLES as readonly string[]).includes(name),
  );
  if (extra.length > 0) {
    warnings.push(`Dump contains tables this build does not know: ${extra.join(", ")}.`);
  }

  console.log(`\nTotal: ${total} row(s)`);

  // --- Structural sanity that a restore would otherwise discover the hard way ---
  const users = (tables["user"] ?? []) as { id?: string }[];
  if (users.length === 0) {
    problems.push('No rows in "user": a GoHa dump with no owner is almost certainly wrong.');
  }
  const userIds = new Set(users.map((u) => u.id).filter(Boolean));

  for (const name of BACKUP_TABLES) {
    const rows = tables[name];
    if (!Array.isArray(rows) || name === "user" || name === "verification") continue;
    const orphans = rows.filter((row) => {
      const owner = (row as { user_id?: string }).user_id;
      return owner !== undefined && owner !== null && !userIds.has(owner);
    }).length;
    if (orphans > 0) {
      problems.push(`Table "${name}": ${orphans} row(s) reference a user not present in the dump.`);
    }
  }
}

console.log("");
for (const warning of warnings) console.log(`WARN  ${warning}`);
for (const problem of problems) console.log(`FAIL  ${problem}`);

if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s). Do not rely on this file.`);
  process.exit(1);
}
console.log(warnings.length > 0 ? "\nUsable, with warnings above." : "\nOK. Structure is complete and internally consistent.");
