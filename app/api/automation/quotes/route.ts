import { quotesRepo } from "@/db";
import {
  authenticateAutomation,
  automationError,
  automationJson,
  finishAutomation,
  isFailure,
  withContext,
} from "@/lib/automation/request";
import { pushQuotesSchema } from "@/lib/validations/automation";

const ROUTE = "POST /api/automation/quotes";

export const dynamic = "force-dynamic";

/**
 * Load quotes and verses into the pool, from wherever you get them.
 *
 * GoHa ships NO content of its own here, on purpose: it does not know which
 * translation you read, and an approximate verse is a wrong verse. So the pool
 * is fed from outside, by an automation that calls whatever source you trust,
 * and this is the door it comes through.
 *
 * Two ways to use it, and they combine:
 *
 *  - Send a batch with no `pinnedFor` to build a library. The card then picks
 *    deterministically from the pool by hashing the local date, so it keeps
 *    working on a morning your automation does not run.
 *  - Send one with `pinnedFor` to say "this exact verse, on this exact date".
 *    A verse-of-the-day source belongs here. The pin wins over the pool pick.
 *
 * Idempotent both ways: the upsert keys on (source, text), and a date holds one
 * pinned quote, so re-running a workflow updates rather than accumulates.
 *
 * `verified` is written false and cannot be set true from here. Checking wording
 * against a real source is a human act (BUILD_PLAN hard rule 6). Nothing hides
 * the text on that account; the flag simply records that nobody has confirmed it.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: ROUTE, scope: "read_write" });
  if (isFailure(auth)) return auth.response;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return await finishAutomation(
        auth,
        ROUTE,
        automationJson({ error: "Send a JSON body." }, { status: 400 }),
      );
    }

    // A bare array is accepted as well as { quotes: [...] }: a workflow that
    // maps an API response straight through should not have to wrap it.
    const parsed = pushQuotesSchema.safeParse(Array.isArray(body) ? { quotes: body } : body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return await finishAutomation(
        auth,
        ROUTE,
        automationJson(
          {
            error: issue?.message ?? "Check the request body.",
            // The path matters when one entry in a batch of fifty is wrong.
            at: issue?.path.join(".") || undefined,
          },
          { status: 422 },
        ),
      );
    }

    const saved = [];
    for (const quote of parsed.data.quotes) {
      saved.push(
        await quotesRepo.upsertQuote(auth.userId, {
          source: quote.source,
          text: quote.text,
          attribution: quote.attribution,
          translation: quote.translation,
          theme: quote.theme,
          // Default to the OWNER's local today when a pin is asked for without
          // a date: an automation running in UTC would otherwise pin tomorrow.
          pinnedFor: quote.pinnedFor ?? (quote.pinToday ? auth.context.localDate : null),
        }),
      );
    }

    const status = await quotesRepo.quotePoolStatus(auth.userId);

    return await finishAutomation(
      auth,
      ROUTE,
      automationJson(
        {
          ...auth.context,
          received: parsed.data.quotes.length,
          pinned: saved.filter((quote) => quote.pinnedFor).map((quote) => ({
            id: quote.id,
            pinnedFor: quote.pinnedFor,
          })),
          pool: status,
        },
        { status: 201 },
      ),
    );
  } catch (error) {
    await finishAutomation(auth, ROUTE, new Response(null, { status: 500 }));
    return automationError(ROUTE, error);
  }
}

/**
 * What is in the pool, and how many days ahead are already pinned.
 *
 * The question a workflow asks before sending: "do I need to top this up?".
 * Counts only, not the content, because a workflow deciding whether to fetch
 * does not need to read back a year of verses to find out.
 */
export async function GET(request: Request): Promise<Response> {
  const route = "GET /api/automation/quotes";
  const auth = await authenticateAutomation(request, { route });
  if (isFailure(auth)) return auth.response;

  try {
    const [status, pinnedToday] = await Promise.all([
      quotesRepo.quotePoolStatus(auth.userId),
      quotesRepo.getPinnedQuote(auth.userId, auth.context.localDate),
    ]);

    return await finishAutomation(
      auth,
      route,
      withContext(auth, {
        pool: status,
        // Whether today is already covered by a pin, so a morning workflow can
        // skip fetching entirely.
        todayIsPinned: Boolean(pinnedToday),
      }),
    );
  } catch (error) {
    return automationError(route, error);
  }
}
