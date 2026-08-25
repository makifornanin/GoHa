import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Migration 0018, read as a file.
 *
 * The interesting part of this migration is not the new column, it is the two
 * backfills. `onboarding_completed_at` has existed since 0000 and is NULL on
 * every row, and the feature added alongside it reads NULL as "has never seen
 * the welcome tour". Without the backfill, applying this migration would greet
 * every established account, including the owner's, with an onboarding popup on
 * their next visit.
 *
 * A unit test cannot apply SQL to Neon, and applying migrations by hand is the
 * owner's job by project rule. What it can do is fail loudly if the statement
 * that protects existing users is ever edited out.
 */

const SQL = readFileSync(
  join(process.cwd(), "db", "migrations", "0018_soft_sway.sql"),
  "utf8",
);

/** Collapse whitespace so assertions do not depend on formatting. */
const normalized = SQL.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").toLowerCase();

describe("migration 0018", () => {
  it("adds the welcome email marker as a nullable column", () => {
    // Additive and nullable: no default, no NOT NULL, nothing that would
    // rewrite or lock the table.
    expect(normalized).toContain(
      'alter table "user_settings" add column "welcome_email_sent_at" timestamp with time zone',
    );
    expect(normalized).not.toContain("not null");
  });

  it("marks existing accounts as having already seen onboarding", () => {
    expect(normalized).toContain(
      'update "user_settings" set "onboarding_completed_at" = now() where "onboarding_completed_at" is null',
    );
  });

  it("marks existing accounts as already welcomed, so nobody is mailed retroactively", () => {
    expect(normalized).toContain(
      'update "user_settings" set "welcome_email_sent_at" = now() where "welcome_email_sent_at" is null',
    );
  });

  it("only ever touches user_settings", () => {
    // A stray UPDATE against another table here would be a data-loss bug that
    // the owner applies by hand, in production, from a file nobody re-reads.
    const tables = [...normalized.matchAll(/(?:alter table|update|delete from|insert into)\s+"?(\w+)"?/g)];
    expect(tables.length).toBeGreaterThan(0);
    for (const [, table] of tables) expect(table).toBe("user_settings");
  });

  it("drops nothing", () => {
    for (const destructive of ["drop table", "drop column", "truncate", "delete from"]) {
      expect(normalized).not.toContain(destructive);
    }
  });

  it("separates its statements so the migrator runs them in order", () => {
    // The journal records breakpoints: true, so drizzle splits on this marker.
    // Without it the three statements arrive as one string.
    expect(SQL.match(/--> statement-breakpoint/g)).toHaveLength(2);
  });
});
