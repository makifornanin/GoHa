import { describe, expect, it } from "vitest";

import {
  CHECK_VIOLATION,
  CONSTRAINTS,
  isCheckViolation,
  isUniqueViolation,
  sqlState,
  UNIQUE_VIOLATION,
  violatedConstraint,
} from "@/lib/db-errors";

/**
 * The database now refuses writes the application also tries to refuse (audit
 * R-08). Callers turn those refusals into sentences, so telling one constraint
 * from another, and from an unrelated failure, has to be exact: mistaking a
 * dropped connection for "already pinned" would tell someone their work was
 * saved when it was not.
 */

/** What @neondatabase/serverless throws: a driver error carrying SQLSTATE. */
function pgError(code: string, constraint?: string): Error {
  return Object.assign(new Error("db said no"), { code, constraint });
}

describe("SQLSTATE reading", () => {
  it("reads the code and constraint off a driver error", () => {
    const error = pgError(UNIQUE_VIOLATION, CONSTRAINTS.oneActiveFocusSession);
    expect(sqlState(error)).toBe(UNIQUE_VIOLATION);
    expect(violatedConstraint(error)).toBe(CONSTRAINTS.oneActiveFocusSession);
  });

  it("unwraps one level of cause, which is how a wrapped driver error arrives", () => {
    const wrapped = new Error("insert failed", {
      cause: pgError(UNIQUE_VIOLATION, CONSTRAINTS.singleOwner),
    });
    expect(sqlState(wrapped)).toBe(UNIQUE_VIOLATION);
    expect(violatedConstraint(wrapped)).toBe(CONSTRAINTS.singleOwner);
  });

  it("says nothing about errors that carry no SQLSTATE", () => {
    expect(sqlState(new Error("socket hang up"))).toBeNull();
    expect(sqlState("not an error")).toBeNull();
    expect(sqlState(null)).toBeNull();
    expect(violatedConstraint(new Error("socket hang up"))).toBeNull();
  });
});

describe("isUniqueViolation", () => {
  it("matches a unique violation, with or without naming the constraint", () => {
    const error = pgError(UNIQUE_VIOLATION, CONSTRAINTS.onePriorityPerTaskPerDay);
    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(error, CONSTRAINTS.onePriorityPerTaskPerDay)).toBe(true);
  });

  it("does not match a different constraint", () => {
    const error = pgError(UNIQUE_VIOLATION, CONSTRAINTS.onePriorityPerSlot);
    expect(isUniqueViolation(error, CONSTRAINTS.onePriorityPerTaskPerDay)).toBe(false);
  });

  it("does not match a named constraint when the driver reported none", () => {
    // Guards the reverse mistake: reporting "already pinned" for a violation
    // nobody identified would be a guess presented as an explanation.
    expect(isUniqueViolation(pgError(UNIQUE_VIOLATION), CONSTRAINTS.singleOwner)).toBe(false);
  });

  it("does not treat other failures as a lost race", () => {
    expect(isUniqueViolation(pgError(CHECK_VIOLATION))).toBe(false);
    expect(isUniqueViolation(new Error("connection terminated"))).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});

describe("isCheckViolation", () => {
  it("matches a check violation by name", () => {
    const error = pgError(CHECK_VIOLATION, "focus_sessions_planned_duration_range");
    expect(isCheckViolation(error)).toBe(true);
    expect(isCheckViolation(error, "focus_sessions_planned_duration_range")).toBe(true);
    expect(isCheckViolation(error, "focus_sessions_duration_non_negative")).toBe(false);
    expect(isUniqueViolation(error)).toBe(false);
  });
});
