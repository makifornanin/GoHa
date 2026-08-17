import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "../client";
import { appSettings, user } from "../schema";
import type { SignupMode } from "../schema";

/**
 * Install-wide settings, and who is allowed to change them.
 *
 * One row, created on demand. The default is `invite_only`, so an install that
 * has never been configured is closed rather than open: forgetting to decide
 * should not publish a sign-up page.
 */

/**
 * Who may sign up. NEVER throws, and that is a deliberate exception to the rule
 * that database errors are not swallowed (CLAUDE.md section 5).
 *
 * Two callers make it necessary. The sign-in page reads this to decide whether
 * to offer account creation, and the sign-up gate reads it to decide whether to
 * allow one. If the read can throw, an unmigrated or briefly unreachable
 * database turns the sign-in page itself into a 500 and locks the owner out of
 * their own app over a footer link. That is a worse failure than any it
 * prevents.
 *
 * The failure is not silent: it is logged, and it resolves to the CLOSED
 * setting, so an unreadable policy refuses sign-ups rather than permitting
 * them. Failing open here would publish a sign-up page by accident.
 */
export async function getSignupMode(): Promise<SignupMode> {
  try {
    const [row] = await db.select().from(appSettings).limit(1);
    return row?.signupMode ?? "invite_only";
  } catch (error) {
    console.error("signup mode unreadable, defaulting to invite only", error);
    return "invite_only";
  }
}

export async function setSignupMode(mode: SignupMode): Promise<SignupMode> {
  const [existing] = await db.select().from(appSettings).limit(1);
  if (!existing) {
    const [created] = await db.insert(appSettings).values({ signupMode: mode }).returning();
    return created.signupMode;
  }
  const [updated] = await db
    .update(appSettings)
    .set({ signupMode: mode })
    .where(eq(appSettings.id, existing.id))
    .returning();
  return updated.signupMode;
}

/**
 * The owner: the account created first.
 *
 * GoHa has no roles table and does not need one. There is exactly one decision
 * that is not personal (who may sign up), and "whoever set this up" is both the
 * obvious answer and one that cannot drift out of sync with anything.
 */
export async function getOwnerId(): Promise<string | null> {
  const [first] = await db
    .select({ id: user.id })
    .from(user)
    .orderBy(asc(user.createdAt))
    .limit(1);
  return first?.id ?? null;
}

export async function isOwner(userId: string): Promise<boolean> {
  return (await getOwnerId()) === userId;
}
