import "server-only";

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
