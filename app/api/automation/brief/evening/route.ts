import {
  automationRepo,
  dailyPrioritiesRepo,
  focusRepo,
  goalsRepo,
  habitsRepo,
  tasksRepo,
} from "@/db";
import { toEveningPayload } from "@/lib/automation/evening";
import {
  authenticateAutomation,
  automationError,
  automationJson,
  disabledSilence,
  finishAutomation,
  isFailure,
  sabbathSilence,
} from "@/lib/automation/request";
import { addDays, type Weekday } from "@/lib/date";

const ROUTE = "GET /api/automation/brief/evening";

export const dynamic = "force-dynamic";

/**
 * The evening summary: what was completed, what slipped, habits against their
 * targets, focus against the week's average.
 *
 * Silent on the Sabbath, because rest days are not graded (Guide 02, step 1.1).
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: ROUTE });
  if (isFailure(auth)) return auth.response;

  try {
    const { settings, context } = auth;
    if (!settings.eveningSummaryEnabled) {
      return await finishAutomation(auth, ROUTE, disabledSilence(auth, "eveningSummaryEnabled"));
    }
    if (context.isSabbath) {
      return await finishAutomation(auth, ROUTE, sabbathSilence(auth));
    }

    const today = context.localDate;
    const timeZone = settings.timezone;
    const detail = new URL(request.url).searchParams.get("detail") === "counts" ? "counts" : "full";

    const [tasks, goals, priorities, habits, habitEntries, focusSessions, delivered] =
      await Promise.all([
        tasksRepo.listTasksForUser(auth.userId),
        goalsRepo.listGoalsWithTaskCounts(auth.userId),
        dailyPrioritiesRepo.listDailyPriorities(auth.userId, today),
        habitsRepo.listHabitsWithSchedule(auth.userId),
        habitsRepo.listEntriesInRange(auth.userId, { from: addDays(today, -400), to: today }),
        // Seven days including today, which is what the average compares against.
        focusRepo.listCompletedSessionsInRange(auth.userId, {
          from: addDays(today, -6),
          to: today,
        }),
        automationRepo.getNotification(auth.userId, `brief:evening:${today}`),
      ]);

    const payload = toEveningPayload({
      tasks,
      goals,
      priorities,
      habits,
      habitEntries,
      focusSessions,
      today,
      timeZone,
      weekStartsOn: (settings.weekStartsOn as Weekday) ?? 1,
      isSabbath: false,
      alreadyDelivered: Boolean(delivered),
      detail,
      now: new Date(),
    });

    return await finishAutomation(auth, ROUTE, automationJson(payload));
  } catch (error) {
    await finishAutomation(auth, ROUTE, new Response(null, { status: 500 }));
    return automationError(ROUTE, error);
  }
}
