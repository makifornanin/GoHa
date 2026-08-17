import {
  dailyPrioritiesRepo,
  goalsRepo,
  habitsRepo,
  tasksRepo,
} from "@/db";
import { toBriefPayload } from "@/lib/automation/brief";
import {
  authenticateAutomation,
  automationError,
  automationJson,
  finishAutomation,
  isFailure,
} from "@/lib/automation/request";
import { addDays, getZonedParts, zonedToday } from "@/lib/date";
import { deriveDaySignal } from "@/lib/today-brain";
import { getUserDatePrefs } from "@/lib/user-settings";

const ROUTE = "GET /api/automation/brief";

/**
 * The day's brief: the same judgement the Today screen shows.
 *
 * This is the endpoint the automation guide is built around. An external
 * scheduler calls it, and what comes back is the app's own opinion, produced by
 * the app's own engine, so a notification cannot say something Today disagrees
 * with. Improving the ranking in `lib/today-brain.ts` improves the notification
 * with nothing to change out there.
 *
 * Read-only. Identity comes from the token, never from the request.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: ROUTE });
  if (isFailure(auth)) return auth.response;

  try {
    const { timeZone } = await getUserDatePrefs(auth.userId);
    const now = new Date();
    const today = zonedToday(now, timeZone);

    const [tasks, goals, priorities, habits, habitEntries] = await Promise.all([
      tasksRepo.listTasksForUser(auth.userId),
      goalsRepo.listGoalsWithTaskCounts(auth.userId),
      dailyPrioritiesRepo.listDailyPriorities(auth.userId, today),
      habitsRepo.listHabitsWithSchedule(auth.userId),
      // Same window Today uses: streaks need history, and today's check-ins are
      // derived from the same rows rather than fetched a second way.
      habitsRepo.listEntriesInRange(auth.userId, { from: addDays(today, -400), to: today }),
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

    return await finishAutomation(
      auth,
      ROUTE,
      automationJson(toBriefPayload({ signal, today, timeZone, now })),
    );
  } catch (error) {
    await finishAutomation(auth, ROUTE, new Response(null, { status: 500 }));
    return automationError(ROUTE, error);
  }
}
