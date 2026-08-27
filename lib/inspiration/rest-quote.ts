import "server-only";

import { quotesRepo } from "@/db";
import type { DailyQuote } from "@/db";
import type { IsoDate } from "@/lib/date";
import { pickRestDayQuote, sourcesFor } from "@/lib/daily-quote";
import type { QuoteSourcePrefValue } from "@/lib/validations/settings";

/**
 * The one way to choose a rest-day quote.
 *
 * Both the Today page and the Sabbath worker job go through here, for the same
 * reason `getDailyInspiration` exists: two copies of a selection rule drift, and
 * these two had. The Sabbath message itself is untouched, this decides only
 * which quote travels with it.
 *
 * Loads lazily on purpose. A pin settles the day outright, and an empty rest
 * pool is the only reason to read the general one, so the common case is a
 * single query rather than three.
 */
export async function resolveRestDayQuote(
  userId: string,
  localDate: IsoDate,
  pref: QuoteSourcePrefValue,
): Promise<DailyQuote | null> {
  const pinned = await quotesRepo.getPinnedQuote(userId, localDate);
  if (pinned) return pickRestDayQuote({ pinned, restPool: [], generalPool: [] }, localDate);

  const restPool = await quotesRepo.listRestQuotes(userId);
  const generalPool =
    restPool.length > 0 ? [] : await quotesRepo.listActiveQuotes(userId, sourcesFor(pref));

  return pickRestDayQuote({ pinned: null, restPool, generalPool }, localDate);
}
