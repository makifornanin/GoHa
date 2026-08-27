import type { IsoDate } from "@/lib/date";

/**
 * The daily quote pick (automation Guide 01, step 1.2).
 *
 * Deterministic: hash the owner's LOCAL date, modulo the active pool. The same
 * date always yields the same quote, which is what lets the card on Today and
 * the morning notification show the same thing without either one telling the
 * other. No stored "quote of the day" row, nothing to keep in sync, and no
 * randomness that would make the two disagree on a slow morning.
 *
 * Pure and pool-shaped rather than database-shaped, so the rule is testable
 * without a database and the caller decides what "active" means.
 */

export type QuoteLike = {
  id: string;
  source: "quote" | "verse";
  text: string;
  attribution: string | null;
  translation: string | null;
  theme: string | null;
};

/**
 * FNV-1a over the date string. Small, stable, and dependency-free; this is a
 * spreading function, not a security primitive, and it must produce the same
 * number today as it did last year.
 */
export function hashDate(date: IsoDate): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < date.length; i++) {
    hash ^= date.charCodeAt(i);
    // >>> 0 keeps it an unsigned 32-bit value; Math.imul does the 32-bit
    // multiply that plain * would lose precision on.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Which sources the preference admits. */
export function sourcesFor(pref: "quote" | "verse" | "both"): ("quote" | "verse")[] {
  return pref === "both" ? ["quote", "verse"] : [pref];
}

/**
 * Pick the quote for a local date. Null when the pool is empty, which is the
 * honest answer and the one the card renders as its empty state.
 */
export function pickDailyQuote<T extends QuoteLike>(pool: T[], date: IsoDate): T | null {
  if (pool.length === 0) return null;
  return pool[hashDate(date) % pool.length];
}

/**
 * The rest-day pick, from pools the caller has already loaded.
 *
 * Split out because the Today page and the Sabbath worker job had each written
 * this sequence separately and had drifted apart: the worker hardcoded a
 * verse-only fallback pool instead of honouring the saved
 * `quoteSourcePref`, and never consulted a pinned quote at all. So on a rest day
 * the card could show one thing and the notification another, and a verse
 * deliberately pinned to that date was ignored by the push.
 *
 * The order is the same one the ordinary day uses: a pin is an explicit choice
 * for this exact date and beats everything, then the rest-themed pool, then the
 * general pool so an empty rest pool still says something.
 */
export function pickRestDayQuote<T extends QuoteLike>(
  sources: { pinned: T | null; restPool: T[]; generalPool: T[] },
  date: IsoDate,
): T | null {
  if (sources.pinned) return sources.pinned;
  const pool = sources.restPool.length > 0 ? sources.restPool : sources.generalPool;
  return pickDailyQuote(pool, date);
}
