import "server-only";

import { and, desc, eq, gte } from "drizzle-orm";

import type { IsoDate } from "@/lib/date";
import type { DailyInspiration, InspirationStore } from "@/lib/inspiration/resolve";
import { db } from "../client";
import { dailyInspirations } from "../schema";

/**
 * Persistence for the Daily Inspiration ledger.
 *
 * User-scoped like every other repository: `userId` is a required argument on
 * each function, never read from the caller's input, so one account can never
 * see or overwrite another's day.
 */

type Row = typeof dailyInspirations.$inferSelect;

function toRecord(row: Row): DailyInspiration {
  return {
    id: row.id,
    userId: row.userId,
    localDate: row.localDate,
    type: row.type,
    text: row.text,
    source: row.source,
    translation: row.translation,
    provider: row.provider,
  };
}

/** The decided record for a local date, or null when the day has not been settled. */
export async function getForDate(
  userId: string,
  localDate: IsoDate,
): Promise<DailyInspiration | null> {
  const [row] = await db
    .select()
    .from(dailyInspirations)
    .where(and(eq(dailyInspirations.userId, userId), eq(dailyInspirations.localDate, localDate)))
    .limit(1);
  return row ? toRecord(row) : null;
}

/** Texts shown to this user on or after `since`, newest first. Freshness input. */
export async function recentTexts(userId: string, since: IsoDate): Promise<string[]> {
  const rows = await db
    .select({ text: dailyInspirations.text })
    .from(dailyInspirations)
    .where(and(eq(dailyInspirations.userId, userId), gte(dailyInspirations.localDate, since)))
    .orderBy(desc(dailyInspirations.localDate));
  return rows.map((row) => row.text);
}

/**
 * Claim the day, or yield to whoever claimed it first.
 *
 * `ON CONFLICT DO NOTHING` returns no row when someone else already inserted
 * for this (user, date), which is precisely the race this exists to survive:
 * the worker preparing a morning job and the owner opening Today can both miss
 * the read and both fetch different content. The loser gets an empty
 * `returning()`, re-reads, and adopts the winner's record, so the day still has
 * exactly one answer and neither caller overwrites the other.
 *
 * Never an update. A decided day is decided; rewriting it is the one thing that
 * would let the Today card and the morning push disagree.
 */
export async function insertIfAbsent(
  input: Omit<DailyInspiration, "id">,
): Promise<DailyInspiration> {
  const [inserted] = await db
    .insert(dailyInspirations)
    .values({
      userId: input.userId,
      localDate: input.localDate,
      type: input.type,
      text: input.text,
      source: input.source,
      translation: input.translation,
      provider: input.provider,
    })
    .onConflictDoNothing({
      target: [dailyInspirations.userId, dailyInspirations.localDate],
    })
    .returning();

  if (inserted) return toRecord(inserted);

  const winner = await getForDate(input.userId, input.localDate);
  if (winner) return winner;

  /*
   * No insert and no row. Only reachable if the winning row was deleted between
   * the two statements, which in practice means the account was removed
   * mid-request. Failing loudly is right: silently synthesising a record would
   * hand back something that is not in the database and therefore not canonical.
   */
  throw new Error("daily inspiration could not be claimed or read back");
}

/** The store the resolver expects, bound to the real database. */
export const store: InspirationStore = {
  find: getForDate,
  recentTexts,
  insertIfAbsent,
};
