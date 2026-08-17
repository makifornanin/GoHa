import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

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
 * Upsert by (source, text), so the seed script is idempotent (Guide 00, A6).
 *
 * `verified` is never raised here. A seed can add content and correct its
 * attribution or translation, but confirming that wording is right against a
 * real source is a human act, and this function is not that human.
 */
export async function upsertQuote(input: {
  source: QuoteSource;
  text: string;
  attribution?: string | null;
  translation?: string | null;
  theme?: string | null;
}): Promise<DailyQuote> {
  const [row] = await db
    .insert(dailyQuotes)
    .values({
      source: input.source,
      text: input.text,
      attribution: input.attribution ?? null,
      translation: input.translation ?? null,
      theme: input.theme ?? null,
    })
    .onConflictDoUpdate({
      target: [dailyQuotes.source, dailyQuotes.text],
      set: {
        attribution: input.attribution ?? null,
        translation: input.translation ?? null,
        theme: input.theme ?? null,
      },
    })
    .returning();
  return row;
}
