import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { automationJobs, automationJobStatus } from "@/db/schema/worker";

describe("automation job persistence", () => {
  it("has explicit durable lifecycle states", () => {
    expect(automationJobStatus.enumValues).toEqual([
      "pending",
      "leased",
      "completed",
      "skipped",
      "failed",
    ]);
  });

  it("deduplicates within a user and indexes the due queue", () => {
    const config = getTableConfig(automationJobs);
    expect(config.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "automation_jobs_user_dedupe_uq",
    );
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "automation_jobs_lease_id_uq",
        "automation_jobs_status_available_idx",
        "automation_jobs_user_kind_date_idx",
      ]),
    );
  });

  it("binds every job to its server-owned user", () => {
    const config = getTableConfig(automationJobs);
    expect(config.foreignKeys).toHaveLength(1);
    expect(config.foreignKeys[0].onDelete).toBe("cascade");
    expect(config.foreignKeys[0].reference().columns.map((column) => column.name)).toEqual([
      "userId",
    ]);
  });

  it("pins lease and completion state invariants in the database", () => {
    const config = getTableConfig(automationJobs);
    expect(config.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "automation_jobs_attempt_count_nonnegative",
        "automation_jobs_lease_state",
        "automation_jobs_completion_state",
        "automation_jobs_pending_not_started",
      ]),
    );
  });
});
