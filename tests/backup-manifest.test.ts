import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BACKUP_FORMAT, BACKUP_TABLES } from "@/scripts/lib/backup-tables.mts";

/**
 * The backup manifest has to keep up with the schema.
 *
 * It did not. `BACKUP_TABLES` said "all 19 tables" while the schema had grown to
 * 30, so `pnpm db:backup` silently omitted eleven of them, including
 * `push_subscriptions` (every paired device) and `notification_log` (the ledger
 * that stops a notification being delivered twice). Nothing failed. Nothing
 * warned. The dump looked fine and was a third short.
 *
 * A list that must match another list needs a test, or it drifts the first time
 * someone adds a table and does not think about backups, which is every time.
 *
 * The schema is read from the LATEST Drizzle snapshot rather than by importing
 * `db/schema`, which pulls in `server-only` and the Drizzle client. The snapshot
 * is generated from that schema and is the same artefact the migrations are
 * built from, so it cannot disagree with what a migrated database contains.
 */

const ROOT = process.cwd();
const META = join(ROOT, "db", "migrations", "meta");

/** The newest `NNNN_snapshot.json`, which describes the fully migrated schema. */
function latestSnapshot(): {
  tables: Record<string, { foreignKeys?: Record<string, { tableTo: string }> }>;
} {
  const files = readdirSync(META)
    .filter((name) => /^\d{4}_snapshot\.json$/.test(name))
    .sort();
  const newest = files[files.length - 1];
  return JSON.parse(readFileSync(join(META, newest), "utf8"));
}

const snapshot = latestSnapshot();

/** Snapshot keys are schema-qualified ("public.tasks"); the dump uses bare names. */
const schemaTables = Object.keys(snapshot.tables).map((key) => key.split(".").pop()!);

describe("backup manifest covers the schema", () => {
  it("backs up every table the schema defines", () => {
    const missing = schemaTables.filter(
      (name) => !(BACKUP_TABLES as readonly string[]).includes(name),
    );
    expect(
      missing,
      `These tables exist in the schema but would NOT be in a JSON dump: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("names no table the schema does not have", () => {
    // A stale entry is the other half: `select * from "gone"` fails the backup.
    const unknown = (BACKUP_TABLES as readonly string[]).filter(
      (name) => !schemaTables.includes(name),
    );
    expect(unknown, `Listed for backup but not in the schema: ${unknown.join(", ")}`).toEqual([]);
  });

  it("lists each table exactly once", () => {
    // A duplicate would dump the table twice and inflate the row count.
    const seen = new Set(BACKUP_TABLES as readonly string[]);
    expect(seen.size).toBe(BACKUP_TABLES.length);
  });

  it("covers the tables whose loss would be unrecoverable", () => {
    /*
     * Named explicitly, not just counted. These are the ones that were missing,
     * and the ones whose absence is invisible until the day it matters: paired
     * devices cannot be re-derived, and the notification ledger is what stops a
     * restored database from re-sending everything it ever sent.
     */
    for (const table of [
      "push_subscriptions",
      "push_pairing_sessions",
      "push_deliveries",
      "notification_log",
      "automation_tokens",
      "automation_requests",
      "automation_jobs",
      "daily_inspirations",
      "daily_quotes",
      "invites",
      "app_settings",
    ]) {
      expect(BACKUP_TABLES as readonly string[], table).toContain(table);
    }
  });

  it("covers the tables added by migrations 0021 and 0022", () => {
    for (const table of [
      "day_plans",
      "day_plan_allocations",
      "day_plan_items",
      "inspiration_takeaways",
    ]) {
      expect(BACKUP_TABLES as readonly string[], table).toContain(table);
    }
  });
});

describe("backup order can actually be replayed", () => {
  it("lists every parent before its children", () => {
    /*
     * The reason order is in the manifest at all: a JSON dump is replayed row
     * by row, and inserting a to-do before its user violates the foreign key.
     * Self-references are skipped (`goals.parent_goal_id`, `tasks.parent_task_id`)
     * because a table cannot precede itself; replaying those needs ordering
     * WITHIN the table, which is a restore concern, not a manifest one.
     */
    const position = new Map(
      (BACKUP_TABLES as readonly string[]).map((name, index) => [name, index]),
    );
    const violations: string[] = [];

    for (const [key, table] of Object.entries(snapshot.tables)) {
      const child = key.split(".").pop()!;
      for (const fk of Object.values(table.foreignKeys ?? {})) {
        const parent = fk.tableTo;
        if (parent === child) continue;
        const childAt = position.get(child);
        const parentAt = position.get(parent);
        if (childAt === undefined || parentAt === undefined) continue;
        if (parentAt > childAt) {
          violations.push(`${child} (${childAt}) comes before its parent ${parent} (${parentAt})`);
        }
      }
    }

    expect(violations, violations.join("; ")).toEqual([]);
  });
});

describe("the envelope marker", () => {
  it("is unchanged by the manifest growing", () => {
    /*
     * The envelope's SHAPE did not change, only the number of tables inside it.
     * A dump taken before a table existed should report that table as missing,
     * because it IS missing; bumping the marker would replace that accurate
     * report with a bare "unexpected format" and lose the detail.
     */
    expect(BACKUP_FORMAT).toBe("goha.backup.v1");
  });
});
