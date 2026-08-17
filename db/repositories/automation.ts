import "server-only";

import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";

import type { IsoDate } from "@/lib/date";
import { db } from "../client";
import { automationDeliveries, automationRequests, automationTokens } from "../schema";
import type { AutomationScope } from "../schema";
import type { AutomationDelivery, AutomationRequest, AutomationToken } from "../types";

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

// --- Delivery ledger (idempotency for external senders) ---

/**
 * Claim (kind, date) for this user, once.
 *
 * The first caller gets the row and sends its notification; every later caller
 * gets null and sends nothing. One statement, settled by
 * `automation_deliveries_user_kind_date_uq`, so two automations firing together
 * cannot both believe they are first.
 */
export async function claimDelivery(
  userId: string,
  input: { kind: string; deliveryDate: IsoDate; detail?: string | null },
): Promise<AutomationDelivery | null> {
  const [row] = await db
    .insert(automationDeliveries)
    .values({
      userId,
      kind: input.kind,
      deliveryDate: input.deliveryDate,
      detail: input.detail ?? null,
    })
    .onConflictDoNothing({
      target: [
        automationDeliveries.userId,
        automationDeliveries.kind,
        automationDeliveries.deliveryDate,
      ],
    })
    .returning();
  return row ?? null;
}

export async function getDelivery(
  userId: string,
  kind: string,
  deliveryDate: IsoDate,
): Promise<AutomationDelivery | null> {
  const [row] = await db
    .select()
    .from(automationDeliveries)
    .where(
      and(
        eq(automationDeliveries.userId, userId),
        eq(automationDeliveries.kind, kind),
        eq(automationDeliveries.deliveryDate, deliveryDate),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listRecentDeliveries(
  userId: string,
  limit = 20,
): Promise<AutomationDelivery[]> {
  return db
    .select()
    .from(automationDeliveries)
    .where(eq(automationDeliveries.userId, userId))
    .orderBy(desc(automationDeliveries.createdAt))
    .limit(limit);
}
