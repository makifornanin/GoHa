import { addDays, type IsoDate } from "@/lib/date";
import { pickFallback } from "./fallback";
import {
  fetchBibleVerse,
  fetchQuote,
  isConcise,
  type InspirationContent,
  type InspirationType,
} from "./providers";

/**
 * Deciding the one Daily Inspiration for a user and a local calendar date.
 *
 * Kept free of `server-only` and of Drizzle: the store is an interface, so the
 * rules that actually matter (one record per day, retry ceiling, freshness,
 * fallback, who wins a race) are testable against an in-memory store instead of
 * a database. `db/repositories/inspirations.ts` supplies the real one.
 */

/** A stored record. Mirrors the `daily_inspirations` row. */
export type DailyInspiration = {
  id: string;
  userId: string;
  localDate: IsoDate;
  type: InspirationType;
  text: string;
  source: string;
  translation: string | null;
  provider: string;
};

/** What the resolver needs from persistence, and nothing more. */
export type InspirationStore = {
  /** The decided record for this day, if there already is one. */
  find(userId: string, localDate: IsoDate): Promise<DailyInspiration | null>;
  /** Texts this user has been shown on or after `since`, for freshness. */
  recentTexts(userId: string, since: IsoDate): Promise<string[]>;
  /**
   * Insert, or return the row that beat us to it.
   *
   * The whole concurrency guarantee sits here: this MUST resolve conflicts on
   * (user_id, local_date) in the database rather than by reading first.
   */
  insertIfAbsent(row: Omit<DailyInspiration, "id">): Promise<DailyInspiration>;
};

/** How far back content must stay distinct, so days do not feel repetitive. */
export const RECENT_WINDOW_DAYS = 30;

/**
 * How many times a provider may disappoint before we stop asking.
 *
 * Bounded, and small. Each attempt is a network round trip on a page render, so
 * this trades a slightly higher chance of a repeat against a page that stays
 * quick and a provider we do not hammer. Exhausting it is not an error: the
 * curated pool answers and the day still gets a record.
 */
export const MAX_PROVIDER_ATTEMPTS = 3;

export type ResolveDeps = {
  store: InspirationStore;
  /** Injected so tests can drive both branches and both failure modes. */
  fetchImpl?: typeof fetch;
  /** Injected so the 50/50 split and the fallback pick are steerable in tests. */
  random?: () => number;
  /** Reports a provider that misbehaved. Never throws, never reaches the user. */
  onProviderIssue?: (message: string) => void;
};

function fetcherFor(type: InspirationType, fetchImpl: typeof fetch | undefined) {
  return type === "quote"
    ? () => fetchQuote(fetchImpl ?? fetch)
    : () => fetchBibleVerse(fetchImpl ?? fetch);
}

/**
 * Ask the provider for something usable, up to the attempt ceiling.
 *
 * Returns null rather than throwing when nothing usable arrives, because every
 * reason to give up here is the same to the caller: use the fallback. A result
 * is rejected when it is over-long or when the user has seen that exact text
 * inside the freshness window; both are retried, not patched up.
 */
async function tryProvider(
  type: InspirationType,
  recent: ReadonlySet<string>,
  deps: ResolveDeps,
): Promise<InspirationContent | null> {
  const fetchOne = fetcherFor(type, deps.fetchImpl);

  for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt++) {
    try {
      const content = await fetchOne();
      if (!isConcise(content)) {
        deps.onProviderIssue?.(`${content.provider}: content too long, attempt ${attempt}`);
        continue;
      }
      if (recent.has(content.text)) {
        deps.onProviderIssue?.(`${content.provider}: repeat within window, attempt ${attempt}`);
        continue;
      }
      return content;
    } catch (error) {
      // Timeouts, non-200s, malformed bodies and abort errors all land here and
      // all mean the same thing. The message is logged, never surfaced.
      deps.onProviderIssue?.(
        `${type} provider failed on attempt ${attempt}: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
  return null;
}

/**
 * The canonical Daily Inspiration for `userId` on `localDate`.
 *
 * Read-through: an existing record is returned untouched, so the Today card and
 * the Morning Brief payload read the same row and refreshing the page cannot
 * change what the day says. Only a miss consults a provider, and only a miss
 * writes.
 */
export async function resolveDailyInspiration(
  userId: string,
  localDate: IsoDate,
  deps: ResolveDeps,
): Promise<DailyInspiration> {
  const existing = await deps.store.find(userId, localDate);
  if (existing) return existing;

  const random = deps.random ?? Math.random;

  // Roughly even, and decided once: the type is settled before anything is
  // fetched, and the record that gets written pins it for the rest of the day.
  const type: InspirationType = random() < 0.5 ? "quote" : "bible_verse";

  const since = addDays(localDate, -RECENT_WINDOW_DAYS);
  // Freshness is a preference, not a precondition. If history cannot be read we
  // still owe the user an inspiration, so an empty set means "nothing known to
  // be recent" and the day proceeds.
  let recent: ReadonlySet<string>;
  try {
    recent = new Set(await deps.store.recentTexts(userId, since));
  } catch (error) {
    deps.onProviderIssue?.(
      `recent history unavailable: ${error instanceof Error ? error.message : "unknown"}`,
    );
    recent = new Set();
  }

  const content =
    (await tryProvider(type, recent, deps)) ?? pickFallback(type, [...recent], random);

  /*
   * Whoever inserts first owns the day.
   *
   * Two callers can reach this line with different content: the worker and the
   * page both missed, both fetched, and both got a different verse. The store
   * resolves that on the unique constraint and hands back the surviving row, so
   * the loser adopts the winner's record rather than overwriting it. That is
   * why this return value is used instead of the local `content`.
   */
  return deps.store.insertIfAbsent({
    userId,
    localDate,
    type: content.type,
    text: content.text,
    source: content.source,
    translation: content.translation ?? null,
    provider: content.provider,
  });
}

/** The wire shape handed to n8n. `translation` is omitted when there is none. */
export type DailyInspirationPayload = {
  type: InspirationType;
  text: string;
  source: string;
  translation?: string;
  provider: string;
};

/** Strip the record down to the agreed payload. Ids and dates stay internal. */
export function toInspirationPayload(record: DailyInspiration): DailyInspirationPayload {
  return {
    type: record.type,
    text: record.text,
    source: record.source,
    ...(record.translation ? { translation: record.translation } : {}),
    provider: record.provider,
  };
}
