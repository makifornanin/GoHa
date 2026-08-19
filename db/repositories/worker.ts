import "server-only";

import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  eq,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { db } from "../client";
import { automationJobs } from "../schema/worker";
import type { NotificationKind } from "../schema/enums";
import { userSettings } from "../schema/settings";

export type AutomationJob = typeof automationJobs.$inferSelect;

export type MaterializeJobInput = {
  userId: string;
  kind: NotificationKind;
  dedupeKey: string;
  localDate: string;
  targetDate?: string | null;
  timezone: string;
  entityType?: string | null;
  entityId?: string | null;
  scheduledFor: Date;
  availableAt?: Date;
};

/** One row per immutable user-scoped key. Repeated scheduler polls are no-ops. */
export async function materializeJob(input: MaterializeJobInput): Promise<AutomationJob | null> {
  const [row] = await db
    .insert(automationJobs)
    .values({
      ...input,
      targetDate: input.targetDate ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      availableAt: input.availableAt ?? input.scheduledFor,
    })
    .onConflictDoNothing({ target: [automationJobs.userId, automationJobs.dedupeKey] })
    .returning();
  return row ?? null;
}

/**
 * Settings rows that have explicitly enabled at least one active worker kind.
 * A push-subscription check is intentionally performed by the service so this
 * repository remains independent of the push table/repository.
 */
export async function listAutomationCandidates() {
  return db
    .select()
    .from(userSettings)
    .where(
      and(
        eq(userSettings.notificationsEnabled, true),
        or(
          eq(userSettings.morningBriefEnabled, true),
          eq(userSettings.eveningSummaryEnabled, true),
          eq(userSettings.deadlineAlertsEnabled, true),
        ),
      ),
    );
}

/**
 * Recover leases before issuing new ones.
 *
 * A provider call may have succeeded immediately before the process died. An
 * expired lease with deliveryStartedAt set is therefore terminal/ambiguous;
 * automatically replaying it would trade a possible miss for a duplicate.
 */
async function recoverExpiredLeases(now: Date): Promise<void> {
  await Promise.all([
    db
      .update(automationJobs)
      .set({
        status: "pending",
        leaseId: null,
        leasedAt: null,
        leaseExpiresAt: null,
        lastErrorCode: "lease_expired_before_delivery",
      })
      .where(
        and(
          eq(automationJobs.status, "leased"),
          lte(automationJobs.leaseExpiresAt, now),
          isNull(automationJobs.deliveryStartedAt),
        ),
      ),
    db
      .update(automationJobs)
      .set({
        status: "failed",
        completedAt: now,
        leaseId: null,
        leasedAt: null,
        leaseExpiresAt: null,
        lastErrorCode: "ambiguous_delivery",
      })
      .where(
        and(
          eq(automationJobs.status, "leased"),
          lte(automationJobs.leaseExpiresAt, now),
          isNotNull(automationJobs.deliveryStartedAt),
        ),
      ),
  ]);
}

/**
 * Lease due jobs with a conditional UPDATE per row.
 *
 * Candidate selection is allowed to race; acquisition is not. Only one worker
 * can change a particular pending row to leased, and losers receive no row.
 */
export async function claimDueJobs(
  limit: number,
  now: Date,
  leaseMilliseconds: number,
): Promise<AutomationJob[]> {
  await recoverExpiredLeases(now);

  const candidates = await db
    .select({ id: automationJobs.id })
    .from(automationJobs)
    .where(and(eq(automationJobs.status, "pending"), lte(automationJobs.availableAt, now)))
    .orderBy(asc(automationJobs.availableAt), asc(automationJobs.createdAt))
    .limit(limit);

  const claimed: AutomationJob[] = [];
  for (const candidate of candidates) {
    const leaseId = randomUUID();
    const [row] = await db
      .update(automationJobs)
      .set({
        status: "leased",
        leaseId,
        leasedAt: now,
        leaseExpiresAt: new Date(now.getTime() + leaseMilliseconds),
        attemptCount: sql`${automationJobs.attemptCount} + 1`,
        lastErrorCode: null,
      })
      .where(
        and(
          eq(automationJobs.id, candidate.id),
          eq(automationJobs.status, "pending"),
          lte(automationJobs.availableAt, now),
        ),
      )
      .returning();
    if (row) claimed.push(row);
  }
  return claimed;
}

export async function getLeasedJob(
  id: string,
  leaseId: string,
  now: Date = new Date(),
): Promise<AutomationJob | null> {
  const [row] = await db
    .select()
    .from(automationJobs)
    .where(
      and(
        eq(automationJobs.id, id),
        eq(automationJobs.status, "leased"),
        eq(automationJobs.leaseId, leaseId),
        sql`${automationJobs.leaseExpiresAt} > ${now}`,
      ),
    )
    .limit(1);
  return row ?? null;
}

function leasedJob(id: string, leaseId: string) {
  return and(
    eq(automationJobs.id, id),
    eq(automationJobs.status, "leased"),
    eq(automationJobs.leaseId, leaseId),
  );
}

function leasedJobBeforeDelivery(id: string, leaseId: string) {
  return and(leasedJob(id, leaseId), isNull(automationJobs.deliveryStartedAt));
}

export async function markDeliveryStarted(
  id: string,
  leaseId: string,
  at: Date,
): Promise<AutomationJob | null> {
  const [row] = await db
    .update(automationJobs)
    .set({ deliveryStartedAt: at })
    .where(leasedJobBeforeDelivery(id, leaseId))
    .returning();
  return row ?? null;
}

export async function completeJob(
  id: string,
  leaseId: string,
  at: Date,
): Promise<AutomationJob | null> {
  const [row] = await db
    .update(automationJobs)
    .set({
      status: "completed",
      completedAt: at,
      leaseId: null,
      leasedAt: null,
      leaseExpiresAt: null,
      lastErrorCode: null,
    })
    .where(leasedJob(id, leaseId))
    .returning();
  return row ?? null;
}

export async function skipJob(
  id: string,
  leaseId: string,
  reason: string,
  at: Date,
): Promise<AutomationJob | null> {
  const [row] = await db
    .update(automationJobs)
    .set({
      status: "skipped",
      completedAt: at,
      leaseId: null,
      leasedAt: null,
      leaseExpiresAt: null,
      lastErrorCode: reason,
    })
    .where(leasedJob(id, leaseId))
    .returning();
  return row ?? null;
}

/** Close a server-derived quiet/stale job only if delivery has not begun. */
export async function skipUndeliveredJob(
  id: string,
  leaseId: string,
  reason: string,
  at: Date,
): Promise<AutomationJob | null> {
  const [row] = await db
    .update(automationJobs)
    .set({
      status: "skipped",
      completedAt: at,
      leaseId: null,
      leasedAt: null,
      leaseExpiresAt: null,
      lastErrorCode: reason,
    })
    .where(leasedJobBeforeDelivery(id, leaseId))
    .returning();
  return row ?? null;
}

export async function retryJob(
  id: string,
  leaseId: string,
  reason: string,
  availableAt: Date,
): Promise<AutomationJob | null> {
  const [row] = await db
    .update(automationJobs)
    .set({
      status: "pending",
      availableAt,
      leaseId: null,
      leasedAt: null,
      leaseExpiresAt: null,
      deliveryStartedAt: null,
      lastErrorCode: reason,
    })
    .where(leasedJob(id, leaseId))
    .returning();
  return row ?? null;
}

/** A worker/model failure must not rewind a concurrently running push. */
export async function retryUndeliveredJob(
  id: string,
  leaseId: string,
  reason: string,
  availableAt: Date,
): Promise<AutomationJob | null> {
  const [row] = await db
    .update(automationJobs)
    .set({
      status: "pending",
      availableAt,
      leaseId: null,
      leasedAt: null,
      leaseExpiresAt: null,
      deliveryStartedAt: null,
      lastErrorCode: reason,
    })
    .where(leasedJobBeforeDelivery(id, leaseId))
    .returning();
  return row ?? null;
}

export async function failJob(
  id: string,
  leaseId: string,
  reason: string,
  at: Date,
): Promise<AutomationJob | null> {
  const [row] = await db
    .update(automationJobs)
    .set({
      status: "failed",
      completedAt: at,
      leaseId: null,
      leasedAt: null,
      leaseExpiresAt: null,
      lastErrorCode: reason,
    })
    .where(leasedJob(id, leaseId))
    .returning();
  return row ?? null;
}

export async function failUndeliveredJob(
  id: string,
  leaseId: string,
  reason: string,
  at: Date,
): Promise<AutomationJob | null> {
  const [row] = await db
    .update(automationJobs)
    .set({
      status: "failed",
      completedAt: at,
      leaseId: null,
      leasedAt: null,
      leaseExpiresAt: null,
      lastErrorCode: reason,
    })
    .where(leasedJobBeforeDelivery(id, leaseId))
    .returning();
  return row ?? null;
}
