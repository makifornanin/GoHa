import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "./auth";

/** The authenticated user shape, inferred from Better Auth. */
export type SessionUser = (typeof auth.$Infer.Session)["user"];

/**
 * Reads the current session from the request cookies. Wrapped in React `cache`
 * so multiple calls within one request (layout, page, header) hit the database
 * once. This is the real, non-optimistic session check (middleware only does a
 * cheap cookie-presence check).
 */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/** The current user, or null when unauthenticated. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Require an authenticated user or redirect to login. Use at the top of every
 * protected server layout/page and Server Action so identity is always derived
 * from the session, never trusted from client input (CLAUDE.md section 5).
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
