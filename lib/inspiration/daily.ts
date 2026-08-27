import "server-only";

import { inspirationsRepo } from "@/db";
import type { IsoDate } from "@/lib/date";
import { resolveDailyInspiration, type DailyInspiration } from "./resolve";

/**
 * The single server-side entry point for a day's inspiration.
 *
 * Both readers go through here: the Today page and the worker preparing a
 * morning job. That is the whole guarantee, so there is deliberately no second
 * way in. The audit found the older quote path had drifted precisely because
 * the same selection was written out at four call sites and one of them was
 * later changed alone.
 *
 * `server-only` is what stops this reaching a client bundle, and with it the
 * provider calls. A client component importing this fails the build rather than
 * shipping a browser-side request to QuoteGarden.
 */
export async function getDailyInspiration(
  userId: string,
  localDate: IsoDate,
): Promise<DailyInspiration> {
  return resolveDailyInspiration(userId, localDate, {
    store: inspirationsRepo.store,
    // Provider trouble is an operational detail, never the user's problem: it
    // is logged for the owner and the caller still receives a record.
    onProviderIssue: (message) => console.warn("[daily-inspiration]", message),
  });
}
