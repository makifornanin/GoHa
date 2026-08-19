import "server-only";

import { randomUUID } from "node:crypto";

import { and, count, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { pushEndpointHash } from "@/lib/push/endpoint";
import { db } from "../client";
import {
  notificationLog,
  pushDeliveries,
  pushPairingSessions,
  pushSubscriptions,
} from "../schema";
import type {
  PushDelivery,
  PushPairingSession,
  PushSubscriptionRecord,
} from "../types";

export type PushSubscriptionRecordInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime?: Date | null;
  deviceLabel?: string | null;
};

function activeSubscriptionWhere(userId: string) {
  return and(
    eq(pushSubscriptions.userId, userId),
    isNull(pushSubscriptions.disabledAt),
    or(
      isNull(pushSubscriptions.expirationTime),
      gt(pushSubscriptions.expirationTime, sql`now()`),
    ),
  );
}

export async function listActiveSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
  return db
    .select()
    .from(pushSubscriptions)
    .where(activeSubscriptionWhere(userId))
    .orderBy(desc(pushSubscriptions.createdAt));
}

export async function countActiveSubscriptions(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(pushSubscriptions)
    .where(activeSubscriptionWhere(userId));
  return row?.total ?? 0;
}

export async function getSubscription(
  userId: string,
  id: string,
): Promise<PushSubscriptionRecord | null> {
  const [row] = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getSubscriptionByEndpoint(
  userId: string,
  endpoint: string,
): Promise<PushSubscriptionRecord | null> {
  const [row] = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * Register or refresh an endpoint without ever transferring its ownership.
 *
 * The global endpoint unique constraint is the conflict target. `setWhere`
 * makes ownership part of that single write: a browser signed into a different
 * account receives null and cannot replace the original owner's keys or label.
 */
export async function upsertSubscription(
  userId: string,
  input: PushSubscriptionRecordInput,
): Promise<PushSubscriptionRecord | null> {
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      expirationTime: input.expirationTime ?? null,
      deviceLabel: input.deviceLabel ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        p256dh: input.p256dh,
        auth: input.auth,
        expirationTime: input.expirationTime ?? null,
        deviceLabel: input.deviceLabel ?? null,
        disabledAt: null,
        failureCount: 0,
        updatedAt: new Date(),
      },
      setWhere: eq(pushSubscriptions.userId, userId),
    })
    .returning();
  return row ?? null;
}

export async function deleteSubscription(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

export async function deleteSubscriptionByEndpoint(
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const rows = await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)),
    )
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

export async function markSubscriptionSuccess(
  userId: string,
  id: string,
  at: Date = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(pushSubscriptions)
    .set({ lastSuccessAt: at, failureCount: 0 })
    .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

/** Record a transient failure without disabling a still-usable endpoint. */
export async function markSubscriptionFailure(
  userId: string,
  id: string,
  at: Date = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(pushSubscriptions)
    .set({
      lastFailureAt: at,
      failureCount: sql`${pushSubscriptions.failureCount} + 1`,
    })
    .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

export async function disableSubscription(
  userId: string,
  id: string,
  at: Date = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(pushSubscriptions)
    .set({
      disabledAt: at,
      lastFailureAt: at,
      failureCount: sql`${pushSubscriptions.failureCount} + 1`,
    })
    .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

// --- Short-lived pairing sessions -------------------------------------------------

export type PairingSessionReplacement = {
  secretHash: string;
  secretPrefix: string;
  issuedAt: Date;
  expiresAt: Date;
};

/** One statement replaces the user's old secret and clears any consumed state. */
export async function replacePairingSession(
  userId: string,
  input: PairingSessionReplacement,
): Promise<PushPairingSession> {
  const [row] = await db
    .insert(pushPairingSessions)
    .values({ ...input, userId, consumedAt: null })
    .onConflictDoUpdate({
      target: pushPairingSessions.userId,
      set: {
        secretHash: input.secretHash,
        secretPrefix: input.secretPrefix,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
        consumedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function getPairingSessionForUser(
  userId: string,
): Promise<PushPairingSession | null> {
  const [row] = await db
    .select()
    .from(pushPairingSessions)
    .where(eq(pushPairingSessions.userId, userId))
    .limit(1);
  return row ?? null;
}

/** Public staging code may call this, but must never return the row to a browser. */
export async function getPairingSessionByHash(
  secretHash: string,
): Promise<PushPairingSession | null> {
  const [row] = await db
    .select()
    .from(pushPairingSessions)
    .where(eq(pushPairingSessions.secretHash, secretHash))
    .limit(1);
  return row ?? null;
}

/**
 * Consume exactly the session expected by the authenticated user.
 *
 * Including the current hash in the conditional update is what makes
 * regeneration safe: an old browser cannot race and consume the replacement
 * row after the owner has generated a new QR. DB `now()` governs both expiry
 * and the consumed timestamp, so application clock skew cannot reopen a code.
 */
export async function consumePairingSession(
  userId: string,
  expectedSecretHash: string,
): Promise<PushPairingSession | null> {
  const [row] = await db
    .update(pushPairingSessions)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(pushPairingSessions.userId, userId),
        eq(pushPairingSessions.secretHash, expectedSecretHash),
        isNull(pushPairingSessions.consumedAt),
        lte(pushPairingSessions.issuedAt, sql`now()`),
        gt(pushPairingSessions.expiresAt, sql`now()`),
      ),
    )
    .returning();
  return row ?? null;
}

// --- Retry-safe per-device delivery ledger ---------------------------------------

export const PUSH_DELIVERY_LEASE_MS = 2 * 60 * 1000;

/** The delivery service checks this once before any device work begins. */
export async function notificationBelongsToUser(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: notificationLog.id })
    .from(notificationLog)
    .where(and(eq(notificationLog.id, notificationId), eq(notificationLog.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export type DeliveryAttemptClaim =
  | { state: "acquired"; delivery: PushDelivery; attemptToken: string }
  | { state: "already_succeeded"; delivery: PushDelivery }
  | { state: "permanent_failure"; delivery: PushDelivery }
  | { state: "busy"; delivery: PushDelivery }
  | { state: "not_owned"; delivery: null };

/**
 * Acquire a short send lease for one owned notification/subscription pair.
 * The upsert and lease predicate are one statement, so concurrent workers
 * cannot both receive an acquired result.
 */
export async function acquireDeliveryAttempt(
  userId: string,
  notificationId: string,
  subscriptionId: string,
  now: Date = new Date(),
): Promise<DeliveryAttemptClaim> {
  const [owned] = await db
    .select({
      notificationId: notificationLog.id,
      subscriptionId: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
    })
    .from(notificationLog)
    .innerJoin(
      pushSubscriptions,
      and(
        eq(pushSubscriptions.id, subscriptionId),
        eq(pushSubscriptions.userId, userId),
        isNull(pushSubscriptions.disabledAt),
        or(
          isNull(pushSubscriptions.expirationTime),
          gt(pushSubscriptions.expirationTime, sql`now()`),
        ),
      ),
    )
    .where(and(eq(notificationLog.id, notificationId), eq(notificationLog.userId, userId)))
    .limit(1);

  if (!owned) return { state: "not_owned", delivery: null };

  const attemptToken = randomUUID();
  const attemptExpiresAt = new Date(now.getTime() + PUSH_DELIVERY_LEASE_MS);
  const subscriptionEndpointHash = pushEndpointHash(owned.endpoint);

  const [acquired] = await db
    .insert(pushDeliveries)
    .values({
      userId,
      notificationId,
      subscriptionId,
      subscriptionEndpointHash,
      attemptCount: 1,
      lastAttemptAt: now,
      attemptToken,
      attemptExpiresAt,
    })
    .onConflictDoUpdate({
      target: [pushDeliveries.notificationId, pushDeliveries.subscriptionEndpointHash],
      set: {
        subscriptionId,
        attemptCount: sql`${pushDeliveries.attemptCount} + 1`,
        lastAttemptAt: now,
        attemptToken,
        attemptExpiresAt,
        lastStatusCode: null,
        lastErrorCode: null,
        updatedAt: now,
      },
      setWhere: and(
        eq(pushDeliveries.userId, userId),
        isNull(pushDeliveries.acceptedAt),
        isNull(pushDeliveries.permanentFailureAt),
        or(isNull(pushDeliveries.attemptExpiresAt), lte(pushDeliveries.attemptExpiresAt, now)),
      ),
    })
    .returning();

  if (acquired) return { state: "acquired", delivery: acquired, attemptToken };

  const [existing] = await db
    .select()
    .from(pushDeliveries)
    .where(
      and(
        eq(pushDeliveries.userId, userId),
        eq(pushDeliveries.notificationId, notificationId),
        eq(pushDeliveries.subscriptionEndpointHash, subscriptionEndpointHash),
      ),
    )
    .limit(1);

  if (!existing) return { state: "not_owned", delivery: null };
  if (existing.acceptedAt) return { state: "already_succeeded", delivery: existing };
  if (existing.permanentFailureAt) return { state: "permanent_failure", delivery: existing };
  return { state: "busy", delivery: existing };
}

function boundedStatus(statusCode: number | null): number | null {
  return statusCode !== null && Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
    ? statusCode
    : null;
}

function boundedErrorCode(errorCode: string): string {
  return /^[a-z0-9_:-]{1,64}$/.test(errorCode) ? errorCode : "delivery_error";
}

export async function markDeliveryAccepted(
  userId: string,
  deliveryId: string,
  attemptToken: string,
  statusCode: number,
  at: Date = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(pushDeliveries)
    .set({
      acceptedAt: at,
      lastStatusCode: boundedStatus(statusCode),
      lastErrorCode: null,
      attemptToken: null,
      attemptExpiresAt: null,
    })
    .where(
      and(
        eq(pushDeliveries.id, deliveryId),
        eq(pushDeliveries.userId, userId),
        eq(pushDeliveries.attemptToken, attemptToken),
        isNull(pushDeliveries.acceptedAt),
        isNull(pushDeliveries.permanentFailureAt),
      ),
    )
    .returning({ id: pushDeliveries.id });
  return rows.length > 0;
}

export async function markDeliveryTransientFailure(
  userId: string,
  deliveryId: string,
  attemptToken: string,
  input: { errorCode: string; statusCode: number | null; at?: Date },
): Promise<boolean> {
  const at = input.at ?? new Date();
  const rows = await db
    .update(pushDeliveries)
    .set({
      lastFailureAt: at,
      lastStatusCode: boundedStatus(input.statusCode),
      lastErrorCode: boundedErrorCode(input.errorCode),
      attemptToken: null,
      attemptExpiresAt: null,
    })
    .where(
      and(
        eq(pushDeliveries.id, deliveryId),
        eq(pushDeliveries.userId, userId),
        eq(pushDeliveries.attemptToken, attemptToken),
        isNull(pushDeliveries.acceptedAt),
        isNull(pushDeliveries.permanentFailureAt),
      ),
    )
    .returning({ id: pushDeliveries.id });
  return rows.length > 0;
}

export async function markDeliveryPermanentFailure(
  userId: string,
  deliveryId: string,
  attemptToken: string,
  input: { errorCode: string; statusCode: number | null; at?: Date },
): Promise<boolean> {
  const at = input.at ?? new Date();
  const rows = await db
    .update(pushDeliveries)
    .set({
      lastFailureAt: at,
      permanentFailureAt: at,
      lastStatusCode: boundedStatus(input.statusCode),
      lastErrorCode: boundedErrorCode(input.errorCode),
      attemptToken: null,
      attemptExpiresAt: null,
    })
    .where(
      and(
        eq(pushDeliveries.id, deliveryId),
        eq(pushDeliveries.userId, userId),
        eq(pushDeliveries.attemptToken, attemptToken),
        isNull(pushDeliveries.acceptedAt),
        isNull(pushDeliveries.permanentFailureAt),
      ),
    )
    .returning({ id: pushDeliveries.id });
  return rows.length > 0;
}
