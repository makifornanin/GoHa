import { quotesRepo } from "@/db";
import {
  authenticateAutomation,
  automationError,
  finishAutomation,
  isFailure,
  withContext,
} from "@/lib/automation/request";
import { pickDailyQuote, sourcesFor } from "@/lib/daily-quote";

const ROUTE = "GET /api/automation/quote/today";

export const dynamic = "force-dynamic";

/**
 * Today's quote, and the day's context.
 *
 * Exempt from the Sabbath gate on purpose: on the rest day this is the ONE
 * thing still being said, and the rest pool is what it says. It doubles as the
 * context endpoint every n8n workflow calls first, which is why it carries the
 * envelope (localDate, timezone, isSabbath) like everything else.
 *
 * The same deterministic pick the Today card uses, so the card and the
 * notification cannot show different quotes on the same morning.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: ROUTE });
  if (isFailure(auth)) return auth.response;

  try {
    const { settings, context } = auth;
    const pool = context.isSabbath
      ? await quotesRepo.listRestQuotes()
      : await quotesRepo.listActiveQuotes(sourcesFor(settings.quoteSourcePref));

    // A rest day with no rest-themed content falls back to the ordinary pool
    // rather than saying nothing at all.
    const effective =
      context.isSabbath && pool.length === 0
        ? await quotesRepo.listActiveQuotes(sourcesFor(settings.quoteSourcePref))
        : pool;

    const quote = pickDailyQuote(effective, context.localDate);

    return await finishAutomation(
      auth,
      ROUTE,
      withContext(auth, {
        quote: quote
          ? {
              id: quote.id,
              source: quote.source,
              text: quote.text,
              attribution: quote.attribution,
              translation: quote.translation,
              theme: quote.theme,
              // Never presented as checked when it has not been. A quote the
              // owner has not confirmed is still shown, but it says so.
              verified: quote.verified,
            }
          : null,
        poolSize: effective.length,
      }),
    );
  } catch (error) {
    return automationError(ROUTE, error);
  }
}
