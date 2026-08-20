import "server-only";

import { eq } from "drizzle-orm";

import { db } from "../client";
import { user } from "../schema";

/**
 * User account queries. Unlike the domain repositories these are not scoped to a
 * session user: they answer global questions used by the auth layer (e.g. the
 * one-time owner bootstrap gate). The Better Auth adapter owns writes to these
 * tables; this repository is read-only.
 */

/** Whether the owner account exists yet. Gates the one-time bootstrap sign-up. */
export async function hasAnyUser(): Promise<boolean> {
  const [row] = await db.select({ id: user.id }).from(user).limit(1);
  return Boolean(row);
}

/** Resolve only the email address for a trusted server-side user ID. */
export async function getUserEmailById(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return row?.email ?? null;
}
