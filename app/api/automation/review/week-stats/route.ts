import { focusRepo, goalsRepo, habitsRepo, reviewsRepo, tasksRepo } from "@/db";
import {
  authenticateAutomation,
  automationError,
  automationJson,
  finishAutomation,
  isFailure,
  sabbathSilence,
} from "@/lib/automation/request";
import { addDays, startOfWeek, type Weekday } from "@/lib/date";
import { deriveReviewStats, weekBounds } from "@/lib/review";

const ROUTE = "GET /api/automation/review/week-stats";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The week's numbers, derived exactly as the Review screen derives them.
 *
 * `lib/review.ts` is reused rather than reimplemented, so a drafted reflection
 * is written from the same figures the owner will see when they open Review on
 * Monday. Two derivations would eventually disagree, and the one in the email
 * would be the one nobody could check.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: ROUTE });
  if (isFailure(auth)) return auth.response;

  try {
    const { settings, context } = auth;
    if (context.isSabbath) {
      return await finishAutomation(auth, ROUTE, sabbathSilence(auth));
    }

    const weekStartsOn = (settings.weekStartsOn as Weekday) ?? 1;
    const requested = new URL(request.url).searchParams.get("week");
    // Default to the week ending today, and snap anything given to a real week
    // boundary: `weekly_reviews` is unique on (user, week_start), so a mid-week
    // date would address a row that can never exist.
    const weekStart =
      requested && ISO_DATE.test(requested)
        ? startOfWeek(requested, weekStartsOn)
        : startOfWeek(context.localDate, weekStartsOn);
    const bounds = weekBounds(weekStart);
    const priorStart = addDays(weekStart, -7);

    const [tasks, goals, habits, entries, sessions, review] = await Promise.all([
      tasksRepo.listTasksForUser(auth.userId),
      goalsRepo.listGoals(auth.userId),
      habitsRepo.listHabitsWithSchedule(auth.userId),
      habitsRepo.listEntriesInRange(auth.userId, { from: addDays(priorStart, -7), to: bounds.end }),
      focusRepo.listCompletedSessionsInRange(auth.userId, { from: priorStart, to: bounds.end }),
      reviewsRepo.getWeeklyReview(auth.userId, weekStart),
    ]);

    const stats = deriveReviewStats({
      week: bounds,
      tasks,
      habits,
      habitEntries: entries,
      sessions,
      goals,
      today: context.localDate,
      weekStartsOn,
      timeZone: settings.timezone,
    });

    return await finishAutomation(
      auth,
      ROUTE,
      automationJson({
        ...context,
        weekStart,
        weekEnd: bounds.end,
        stats,
        // The draft endpoint refuses to touch a finished review; saying so here
        // lets the workflow stop before it spends a model call.
        review: {
          exists: Boolean(review),
          completed: Boolean(review?.completedAt),
          hasWins: Boolean(review?.wins),
          hasChallenges: Boolean(review?.challenges),
          hasNextWeekFocus: Boolean(review?.focusNextWeek),
        },
        dedupeKey: `review:${weekStart}`,
      }),
    );
  } catch (error) {
    await finishAutomation(auth, ROUTE, new Response(null, { status: 500 }));
    return automationError(ROUTE, error);
  }
}
