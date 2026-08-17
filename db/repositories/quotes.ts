import "server-only";

import { and, asc, eq, inArray, ne } from "drizzle-orm";

import type { IsoDate } from "@/lib/date";
import { db } from "../client";
import { dailyQuotes } from "../schema";
import type { QuoteSource } from "../schema";
import type { DailyQuote } from "../types";

/**
 * The daily quote pool. NOT user-scoped: it is reference content, shared, and
 * the owner's preference for which kind to see lives in `user_settings`.
 *
 * Ordering is `created_at` then `id`, always, because the pick is a hash over
 * the local date modulo the pool (Guide 01, step 1.2): the same date must
 * choose the same row, and an unordered read would make that promise false the
 * moment Postgres returned the rows differently.
 */

export async function listActiveQuotes(sources: QuoteSource[]): Promise<DailyQuote[]> {
  if (sources.length === 0) return [];
  return db
    .select()
    .from(dailyQuotes)
    .where(and(eq(dailyQuotes.active, true), inArray(dailyQuotes.source, sources)))
    .orderBy(asc(dailyQuotes.createdAt), asc(dailyQuotes.id));
}

/** The rest-themed pool the Sabbath message draws from (Guide 07, step 3.1). */
export async function listRestQuotes(): Promise<DailyQuote[]> {
  return db
    .select()
    .from(dailyQuotes)
    .where(and(eq(dailyQuotes.active, true), eq(dailyQuotes.theme, "rest")))
    .orderBy(asc(dailyQuotes.createdAt), asc(dailyQuotes.id));
}

export async function countActiveQuotes(): Promise<number> {
  const rows = await db
    .select({ id: dailyQuotes.id })
    .from(dailyQuotes)
    .where(eq(dailyQuotes.active, true));
  return rows.length;
}

/**
 * The quote an automation pinned to this date, if any.
 *
 * Checked before the deterministic pick: an automation that fetched a verse of
 * the day from somewhere else has named this exact row for this exact date, and
 * that beats a hash over the pool.
 */
export async function getPinnedQuote(date: IsoDate): Promise<DailyQuote | null> {
  const [row] = await db
    .select()
    .from(dailyQuotes)
    .where(and(eq(dailyQuotes.active, true), eq(dailyQuotes.pinnedFor, date)))
    .limit(1);
  return row ?? null;
}

/**
 * Upsert by (source, text), so both the seed script and a repeating automation
 * are idempotent: posting the same verse every morning updates one row rather
 * than growing the pool by one a day.
 *
 * `verified` is never raised here, by any caller. Content can be added and its
 * attribution corrected, but confirming that wording is right against a real
 * source is a human act, and neither a script nor an HTTP request is that
 * human (BUILD_PLAN hard rule 6).
 */
export async function upsertQuote(input: {
  source: QuoteSource;
  text: string;
  attribution?: string | null;
  translation?: string | null;
  theme?: string | null;
  pinnedFor?: IsoDate | null;
}): Promise<DailyQuote> {
  const values = {
    attribution: input.attribution ?? null,
    translation: input.translation ?? null,
    theme: input.theme ?? null,
  };

  const [row] = await db
    .insert(dailyQuotes)
    .values({ source: input.source, text: input.text, ...values })
    .onConflictDoUpdate({ target: [dailyQuotes.source, dailyQuotes.text], set: values })
    .returning();

  if (!input.pinnedFor) return row;

  /*
   * Pinning is a second statement because it conflicts on a different key: a
   * date holds one quote, and the row being pinned may already be in the pool
   * under some other date. Clearing first means re-posting a different verse
   * for the same day replaces it instead of failing on the unique index.
   *
   * Two automations racing for one date is harmless: the later write wins, and
   * the date still ends up with exactly one quote.
   */
  await db
    .update(dailyQuotes)
    .set({ pinnedFor: null })
    .where(and(eq(dailyQuotes.pinnedFor, input.pinnedFor), ne(dailyQuotes.id, row.id)));

  const [pinned] = await db
    .update(dailyQuotes)
    .set({ pinnedFor: input.pinnedFor })
    .where(eq(dailyQuotes.id, row.id))
    .returning();
  return pinned ?? row;
}

/** Retire a quote without deleting it, so it can come back later. */
export async function setQuoteActive(id: string, active: boolean): Promise<DailyQuote | null> {
  const [row] = await db
    .update(dailyQuotes)
    .set({ active })
    .where(eq(dailyQuotes.id, id))
    .returning();
  return row ?? null;
}

/** Pool status, for an automation deciding whether it needs to send anything. */
export async function quotePoolStatus(): Promise<{
  total: number;
  active: number;
  rest: number;
  pinnedAhead: number;
}> {
  const rows = await db
    .select({
      active: dailyQuotes.active,
      theme: dailyQuotes.theme,
      pinnedFor: dailyQuotes.pinnedFor,
    })
    .from(dailyQuotes);

  const today = new Date().toISOString().slice(0, 10);
  return {
    total: rows.length,
    active: rows.filter((row) => row.active).length,
    rest: rows.filter((row) => row.active && row.theme === "rest").length,
    // Days already covered, so a workflow can top up rather than re-send.
    pinnedAhead: rows.filter((row) => row.active && row.pinnedFor && row.pinnedFor >= today).length,
  };
}
