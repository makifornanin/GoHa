import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";
import { notificationKind } from "./enums";

/** Durable lifecycle for work leased to the central automation worker. */
export const automationJobStatus = pgEnum("automation_job_status", [
  "pending",
  "leased",
  "completed",
  "skipped",
  "failed",
]);

/**
 * A server-owned automation job.
 *
 * The caller never supplies userId, localDate, entityId or dedupeKey. GoHa
 * materializes those immutable values from the user's settings and domain
 * data, then gives the worker only an opaque row id and a short lease id.
 * Payloads are deliberately not stored: they are rebuilt through the same
 * deterministic services the personal-token endpoints use.
 */
export const automationJobs = pgTable(
  "automation_jobs",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: notificationKind().notNull(),
    dedupeKey: text().notNull(),
    /** The user's local calendar date this delivery belongs to. */
    localDate: date().notNull(),
    /** Reserved for immutable targets such as a future Review weekStart. */
    targetDate: date(),
    /** Saved-zone snapshot. A later zone change makes an old job stale. */
    timezone: text().notNull(),
    entityType: text(),
    entityId: uuid(),
    scheduledFor: timestamp({ withTimezone: true }).notNull(),
    /** Retry/backoff moves this without changing the original schedule. */
    availableAt: timestamp({ withTimezone: true }).notNull(),
    status: automationJobStatus().notNull().default("pending"),
    /** Random per lease; worker auth is still required on every call. */
    leaseId: uuid(),
    leasedAt: timestamp({ withTimezone: true }),
    leaseExpiresAt: timestamp({ withTimezone: true }),
    attemptCount: integer().notNull().default(0),
    /**
     * Set immediately before any provider call. An expired lease carrying this
     * marker is ambiguous and must not be replayed automatically.
     */
    deliveryStartedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    lastErrorCode: text(),
    payloadVersion: smallint().notNull().default(1),
    ...auditTimestamps,
  },
  (t) => [
    unique("automation_jobs_user_dedupe_uq").on(t.userId, t.dedupeKey),
    uniqueIndex("automation_jobs_lease_id_uq")
      .on(t.leaseId)
      .where(sql`${t.leaseId} is not null`),
    index("automation_jobs_status_available_idx").on(t.status, t.availableAt),
    index("automation_jobs_user_kind_date_idx").on(t.userId, t.kind, t.localDate),
    check("automation_jobs_attempt_count_nonnegative", sql`${t.attemptCount} >= 0`),
    check(
      "automation_jobs_lease_state",
      sql`(
        ${t.status} = 'leased'
        and ${t.leaseId} is not null
        and ${t.leasedAt} is not null
        and ${t.leaseExpiresAt} is not null
        and ${t.leaseExpiresAt} > ${t.leasedAt}
      ) or (
        ${t.status} <> 'leased'
        and ${t.leaseId} is null
        and ${t.leasedAt} is null
        and ${t.leaseExpiresAt} is null
      )`,
    ),
    check(
      "automation_jobs_completion_state",
      sql`(${t.status} in ('completed', 'skipped', 'failed')) = (${t.completedAt} is not null)`,
    ),
    check(
      "automation_jobs_pending_not_started",
      sql`${t.status} <> 'pending' or ${t.deliveryStartedAt} is null`,
    ),
  ],
);

export type AutomationJobStatus = (typeof automationJobStatus.enumValues)[number];
