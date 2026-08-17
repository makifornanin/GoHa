import "server-only";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "../client";
import { invites } from "../schema";
import type { Invite } from "../types";

/**
 * Invitations. Not user-scoped on the read path that matters: an invitation is
 * presented by someone who has no account yet, so the lookup happens before
 * there is any identity to scope by. Everything the OWNER sees is scoped by
 * `invitedBy`.
 */

export async function listInvites(userId: string): Promise<Invite[]> {
  return db
    .select()
    .from(invites)
    .where(eq(invites.invitedBy, userId))
    .orderBy(desc(invites.createdAt));
}

export async function createInvite(
  userId: string,
  input: {
    codeHash: string;
    codePrefix: string;
    email?: string | null;
    label?: string | null;
    expiresAt?: Date | null;
  },
): Promise<Invite> {
  const [row] = await db
    .insert(invites)
    .values({
      invitedBy: userId,
      codeHash: input.codeHash,
      codePrefix: input.codePrefix,
      email: input.email ?? null,
      label: input.label ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return row;
}

/** Candidates for a presented code, by public prefix. Confirm the hash after. */
export async function findInvitesByPrefix(prefix: string): Promise<Invite[]> {
  return db.select().from(invites).where(eq(invites.codePrefix, prefix));
}

/**
 * Take the invitation, once.
 *
 * ONE conditional update, so the claim is decided by the database rather than
 * by a read followed by a write. Two people opening the same link at the same
 * moment: one gets the row back, the other gets null and is told it is already
 * used. Without this, both would pass a "is it unused?" check and both would
 * get an account.
 *
 * Claimed BEFORE the account is created, and released by `releaseInvite` if the
 * sign-up then fails, so a crash mid-signup does not burn the invitation.
 */
export async function claimInvite(id: string, at: Date = new Date()): Promise<Invite | null> {
  const [row] = await db
    .update(invites)
    .set({ claimedAt: at })
    .where(
      and(
        eq(invites.id, id),
        isNull(invites.claimedAt),
        isNull(invites.revokedAt),
        // An expiry in the past is not usable, decided here rather than in the
        // caller so it cannot be checked and then raced past.
        or(isNull(invites.expiresAt), sql`${invites.expiresAt} > now()`),
      ),
    )
    .returning();
  return row ?? null;
}

/** Give the invitation back after a failed sign-up. */
export async function releaseInvite(id: string): Promise<void> {
  await db
    .update(invites)
    .set({ claimedAt: null })
    .where(and(eq(invites.id, id), isNull(invites.acceptedAt)));
}

/** Record which account the invitation produced. */
export async function acceptInvite(id: string, userId: string): Promise<Invite | null> {
  const [row] = await db
    .update(invites)
    .set({ acceptedBy: userId, acceptedAt: new Date() })
    .where(eq(invites.id, id))
    .returning();
  return row ?? null;
}

export async function revokeInvite(userId: string, id: string): Promise<Invite | null> {
  const [row] = await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invites.id, id),
        eq(invites.invitedBy, userId),
        isNull(invites.revokedAt),
        // An accepted invitation is history, not something to withdraw. Removing
        // the account is a different act, done deliberately elsewhere.
        isNull(invites.acceptedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteInvite(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(invites)
    .where(and(eq(invites.id, id), eq(invites.invitedBy, userId)))
    .returning({ id: invites.id });
  return rows.length > 0;
}
