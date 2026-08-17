import { automationRepo, dailyPrioritiesRepo, goalsRepo, habitsRepo, quotesRepo, tasksRepo } from "@/db";
import { toMorningPayload } from "@/lib/automation/brief";
import {
  authenticateAutomation,
  automationError,
  automationJson,
  disabledSilence,
  finishAutomation,
  isFailure,
  withContext,
} from "@/lib/automation/request";
import { pickDailyQuote, sourcesFor } from "@/lib/daily-quote";
import { addDays, getZonedParts, type Weekday } from "@/lib/date";
import { SABBATH_MESSAGE } from "@/lib/sabbath";
import { deriveDaySignal } from "@/lib/today-brain";

const ROUTE = "GET /api/automation/brief/morning";

export const dynamic = "force-dynamic";

/**
 * The morning brief: the same judgement the Today screen shows.
 *
 * The endpoint the whole automation layer is built around. An external
 * scheduler calls it, and what comes back is the app's own opinion, produced by
 * the app's own engine, so a notification cannot say something Today disagrees
 * with. Improving the ranking in `lib/today-brain.ts` improves the notification
 * with nothing to change out there.
 *
 * On the Sabbath this serves the rest payload instead of the day's work
 * (Guide 07, step 2.2): the one message that still goes out, and it carries a
 * verse rather than a list.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: ROUTE });
  if (isFailure(auth)) return auth.response;

  try {
    const { settings, context } = auth;
    const today = context.localDate;
    const timeZone = settings.timezone;
    const weekStartsOn = (settings.weekStartsOn as Weekday) ?? 1;
    const now = new Date();

    if (!settings.morningBriefEnabled) {
      return await finishAutomation(auth, ROUTE, disabledSilence(auth, "morningBriefEnabled"));
    }

    // The rest day: a verse and a fixed sentence, no task content at all.
    // The message is deliberately not AI-written; a rest reminder should be the
    // same calm sentence every week, not a model's variation on it.
    if (context.isSabbath) {
      const rest = await quotesRepo.listRestQuotes();
      const fallback = rest.length > 0 ? rest : await quotesRepo.listActiveQuotes(["verse"]);
      const quote = pickDailyQuote(fallback, today);
      return await finishAutomation(
        auth,
        ROUTE,
        withContext(auth, {
          sabbath: true,
          message: SABBATH_MESSAGE,
          quote: quote
            ? { text: quote.text, attribution: quote.attribution, translation: quote.translation }
            : null,
        }),
      );
    }

    const [tasks, goals, priorities, habits, habitEntries, quotes, delivered] = await Promise.all([
      tasksRepo.listTasksForUser(auth.userId),
      goalsRepo.listGoalsWithTaskCounts(auth.userId),
      dailyPrioritiesRepo.listDailyPriorities(auth.userId, today),
      habitsRepo.listHabitsWithSchedule(auth.userId),
      // The same wide window Today uses: streaks need history, and today's
      // check-ins are derived from these rows rather than fetched a second way.
      habitsRepo.listEntriesInRange(auth.userId, { from: addDays(today, -400), to: today }),
      quotesRepo.listActiveQuotes(sourcesFor(settings.quoteSourcePref)),
      automationRepo.getNotification(auth.userId, `brief:morning:${today}`),
    ]);

    const signal = deriveDaySignal({
      tasks,
      goals,
      priorities,
      habits,
      habitEntries,
      today,
      timeZone,
      hour: getZonedParts(now, timeZone).hour,
    });

    const payload = toMorningPayload({
      signal,
      tasks,
      goals,
      habits,
      habitEntries,
      quote: pickDailyQuote(quotes, today),
      alreadyDelivered: Boolean(delivered),
      today,
      timeZone,
      weekStartsOn,
      isSabbath: false,
      now,
    });

    return await finishAutomation(auth, ROUTE, automationJson(payload));
  } catch (error) {
    await finishAutomation(auth, ROUTE, new Response(null, { status: 500 }));
    return automationError(ROUTE, error);
  }
}
