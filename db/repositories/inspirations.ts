import "server-only";

import { and, desc, eq, gte, lte } from "drizzle-orm";

import type { IsoDate } from "@/lib/date";
import type { DailyInspiration, InspirationStore } from "@/lib/inspiration/resolve";
import { db } from "../client";
import { dailyInspirations, inspirationTakeaways } from "../schema";
import type { InspirationTakeaway } from "../types";

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
 * References and authors shown on or after `since`, newest first.
 *
 * Steers the verse pick BEFORE the request rather than judging it after: GoHa
 * now chooses the reference itself, so a repeat can be avoided instead of
 * costing a round trip and a retry to discover.
 */
export async function recentSources(userId: string, since: IsoDate): Promise<string[]> {
  const rows = await db
    .select({ source: dailyInspirations.source })
    .from(dailyInspirations)
    .where(and(eq(dailyInspirations.userId, userId), gte(dailyInspirations.localDate, since)))
    .orderBy(desc(dailyInspirations.localDate));
  return rows.map((row) => row.source);
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
  recentSources,
  insertIfAbsent,
};

/* ------------------------------------------------------------------ */
/* Takeaways                                                           */
/* ------------------------------------------------------------------ */

/** This user's note for a local date, or null when they have not written one. */
export async function getTakeaway(
  userId: string,
  localDate: IsoDate,
): Promise<InspirationTakeaway | null> {
  const [row] = await db
    .select()
    .from(inspirationTakeaways)
    .where(
      and(
        eq(inspirationTakeaways.userId, userId),
        eq(inspirationTakeaways.localDate, localDate),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Write, or rewrite, the day's takeaway.
 *
 * An upsert on (user, date) rather than a read-then-branch, for the same reason
 * the inspiration insert is: two saves arriving together would otherwise both
 * find nothing and both insert, and one would fail on the constraint with a
 * generic error after the user pressed Save. The database settles it.
 *
 * `inspirationId` and `localDate` come from the SERVER's resolved inspiration
 * for that day, never from the client, so a takeaway can only ever be attached
 * to the record the user was actually shown.
 */
export async function upsertTakeaway(input: {
  userId: string;
  inspirationId: string;
  localDate: IsoDate;
  body: string;
}): Promise<InspirationTakeaway> {
  const [row] = await db
    .insert(inspirationTakeaways)
    .values(input)
    .onConflictDoUpdate({
      target: [inspirationTakeaways.userId, inspirationTakeaways.localDate],
      set: {
        body: input.body,
        inspirationId: input.inspirationId,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/**
 * Clear the day's takeaway.
 *
 * Deleting rather than storing an empty string: "nothing written" then has one
 * representation instead of two, and the check constraint on `body` refuses the
 * empty row anyway.
 */
export async function deleteTakeaway(userId: string, localDate: IsoDate): Promise<boolean> {
  const rows = await db
    .delete(inspirationTakeaways)
    .where(
      and(
        eq(inspirationTakeaways.userId, userId),
        eq(inspirationTakeaways.localDate, localDate),
      ),
    )
    .returning({ id: inspirationTakeaways.id });
  return rows.length > 0;
}

/** An inspiration with the note its reader left beside it. */
export type InspirationWithTakeaway = DailyInspiration & {
  takeaway: { body: string; updatedAt: Date } | null;
};

/**
 * A week of inspirations and the takeaways written about them, newest first.
 *
 * One query with a LEFT JOIN rather than two reads and a merge in JavaScript:
 * the join key is (user, local_date), which the takeaway table is already
 * indexed on, and a day with no note is exactly what the left join expresses.
 *
 * Bounded by DATE, not by a row count, because the caller is a week view and a
 * "last 7 rows" read would silently show the wrong week for anyone who had not
 * opened GoHa every day.
 */
export async function listWithTakeawaysInRange(
  userId: string,
  range: { from: IsoDate; to: IsoDate },
): Promise<InspirationWithTakeaway[]> {
  const rows = await db
    .select({
      inspiration: dailyInspirations,
      takeawayBody: inspirationTakeaways.body,
      takeawayUpdatedAt: inspirationTakeaways.updatedAt,
    })
    .from(dailyInspirations)
    .leftJoin(
      inspirationTakeaways,
      and(
        eq(inspirationTakeaways.userId, dailyInspirations.userId),
        eq(inspirationTakeaways.localDate, dailyInspirations.localDate),
      ),
    )
    .where(
      and(
        eq(dailyInspirations.userId, userId),
        gte(dailyInspirations.localDate, range.from),
        lte(dailyInspirations.localDate, range.to),
      ),
    )
    .orderBy(desc(dailyInspirations.localDate));

  return rows.map((row) => ({
    ...toRecord(row.inspiration),
    takeaway:
      row.takeawayBody != null && row.takeawayUpdatedAt != null
        ? { body: row.takeawayBody, updatedAt: row.takeawayUpdatedAt }
        : null,
  }));
}
