import "server-only";

import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import type { IsoDate } from "@/lib/date";
import { db } from "../client";
import { automationRequests, automationTokens, notificationLog } from "../schema";
import type { AutomationScope, NotificationKind } from "../schema";
import type { AutomationRequest, AutomationToken, NotificationLogEntry } from "../types";

/**
 * Automation repository. User-scoped like every other repository, with one
 * deliberate exception: `findTokenByPrefix` is how a request establishes WHICH
 * user is calling, so it cannot take a user id. It is the authentication
 * lookup, and everything downstream of it is scoped by the id it returns.
 */

export async function listTokens(userId: string): Promise<AutomationToken[]> {
  return db
    .select()
    .from(automationTokens)
    .where(eq(automationTokens.userId, userId))
    .orderBy(desc(automationTokens.createdAt));
}

export async function createTokenRecord(
  userId: string,
  input: {
    name: string;
    tokenHash: string;
    tokenPrefix: string;
    scope?: AutomationScope;
    expiresAt?: Date | null;
  },
): Promise<AutomationToken> {
  const [row] = await db
    .insert(automationTokens)
    .values({
      userId,
      name: input.name,
      tokenHash: input.tokenHash,
      tokenPrefix: input.tokenPrefix,
      scope: input.scope ?? "read",
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return row;
}

/** Revoke rather than delete: the request log keeps its subject. */
export async function revokeToken(userId: string, id: string): Promise<AutomationToken | null> {
  const [row] = await db
    .update(automationTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(automationTokens.id, id),
        eq(automationTokens.userId, userId),
        isNull(automationTokens.revokedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/** Delete a token outright, once the owner is done with its history too. */
export async function deleteToken(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(automationTokens)
    .where(and(eq(automationTokens.id, id), eq(automationTokens.userId, userId)))
    .returning({ id: automationTokens.id });
  return rows.length > 0;
}

/**
 * Candidates for an incoming token, found by its public prefix.
 *
 * A prefix is not proof of anything: the caller must still compare the full
 * hash in constant time. Returning every match (there is normally one) keeps
 * that decision with the caller rather than smuggling it into a query.
 */
export async function findTokensByPrefix(prefix: string): Promise<AutomationToken[]> {
  return db.select().from(automationTokens).where(eq(automationTokens.tokenPrefix, prefix));
}

export async function touchToken(id: string, at: Date = new Date()): Promise<void> {
  await db.update(automationTokens).set({ lastUsedAt: at }).where(eq(automationTokens.id, id));
}

// --- Request log (audit trail and rate-limit source) ---

export async function recordRequest(input: {
  userId: string;
  tokenId: string | null;
  route: string;
  status: number;
}): Promise<void> {
  await db.insert(automationRequests).values({
    userId: input.userId,
    tokenId: input.tokenId,
    route: input.route,
    status: input.status,
  });
}

/** How many requests this token has made since `since`. Backs the rate limit. */
export async function countRequestsSince(tokenId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(automationRequests)
    .where(and(eq(automationRequests.tokenId, tokenId), gte(automationRequests.createdAt, since)));
  return row?.total ?? 0;
}

export async function listRecentRequests(
  userId: string,
  limit = 20,
): Promise<AutomationRequest[]> {
  return db
    .select()
    .from(automationRequests)
    .where(eq(automationRequests.userId, userId))
    .orderBy(desc(automationRequests.createdAt))
    .limit(limit);
}

/**
 * Drop request rows older than `before`. The log is an operational record, not
 * history worth keeping forever, and nothing else reads it.
 */
export async function pruneRequests(userId: string, before: Date): Promise<number> {
  const rows = await db
    .delete(automationRequests)
    .where(
      and(
        eq(automationRequests.userId, userId),
        sql`${automationRequests.createdAt} < ${before.toISOString()}`,
      ),
    )
    .returning({ id: automationRequests.id });
  return rows.length;
}

// --- Notification log (exactly-once delivery for external senders) ---

/**
 * Claim a dedupe key for this user, once.
 *
 * ONE race-safe `INSERT ... ON CONFLICT DO NOTHING`, never select-then-insert
 * (Guide 00, dedupe scheme). The first caller gets the row and sends its
 * message; every later caller gets null, and the endpoint answers 409 so the
 * workflow drops that item instead of sending it twice.
 */
export async function claimNotification(
  userId: string,
  input: {
    kind: NotificationKind;
    dedupeKey: string;
    localDate: IsoDate;
    entityType?: string | null;
    entityId?: string | null;
    payload?: Record<string, unknown> | null;
  },
): Promise<NotificationLogEntry | null> {
  const [row] = await db
    .insert(notificationLog)
    .values({
      userId,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      localDate: input.localDate,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload ?? null,
    })
    .onConflictDoNothing({ target: [notificationLog.userId, notificationLog.dedupeKey] })
    .returning();
  return row ?? null;
}

/** The winner of a key, for re-serving what was already sent. */
export async function getNotification(
  userId: string,
  dedupeKey: string,
): Promise<NotificationLogEntry | null> {
  const [row] = await db
    .select()
    .from(notificationLog)
    .where(and(eq(notificationLog.userId, userId), eq(notificationLog.dedupeKey, dedupeKey)))
    .limit(1);
  return row ?? null;
}

/** Which of these keys are already claimed. Used to exclude alerted items. */
export async function claimedKeys(userId: string, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await db
    .select({ dedupeKey: notificationLog.dedupeKey })
    .from(notificationLog)
    .where(and(eq(notificationLog.userId, userId), inArray(notificationLog.dedupeKey, keys)));
  return new Set(rows.map((row) => row.dedupeKey));
}

/**
 * Prior entries of one kind, newest first.
 *
 * The graveyard sweep reads these back to count how many weeks running a task
 * has appeared, by task id inside the payload rather than by title (Guide 05,
 * step 1.4): two different tasks that happen to share a title must not share a
 * repeat history.
 */
export async function listNotificationsByKind(
  userId: string,
  kind: NotificationKind,
  limit = 12,
): Promise<NotificationLogEntry[]> {
  return db
    .select()
    .from(notificationLog)
    .where(and(eq(notificationLog.userId, userId), eq(notificationLog.kind, kind)))
    .orderBy(desc(notificationLog.sentAt))
    .limit(limit);
}

export async function listRecentNotifications(
  userId: string,
  limit = 20,
): Promise<NotificationLogEntry[]> {
  return db
    .select()
    .from(notificationLog)
    .where(eq(notificationLog.userId, userId))
    .orderBy(desc(notificationLog.sentAt))
    .limit(limit);
}

/**
 * Whether any of `kinds` was delivered to this user since `since`.
 *
 * Existence, not a list: the smart reminder only needs to know whether it would
 * be landing on top of a louder message, and asking for a single row lets the
 * `(user_id, sent_at)` index answer without reading a history back.
 *
 * `sentAt` is the right column rather than `createdAt`, because a claim that
 * never reached a device did not interrupt anyone.
 */
export async function hasRecentNotificationOfKinds(
  userId: string,
  kinds: readonly NotificationKind[],
  since: Date,
): Promise<boolean> {
  if (kinds.length === 0) return false;
  const [row] = await db
    .select({ id: notificationLog.id })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.userId, userId),
        inArray(notificationLog.kind, [...kinds]),
        gte(notificationLog.sentAt, since),
      ),
    )
    .limit(1);
  return Boolean(row);
}
