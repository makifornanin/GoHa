import { habitsRepo } from "@/db";
import { toHabitsDuePayload } from "@/lib/automation/habits";
import {
  authenticateAutomation,
  automationError,
  automationJson,
  finishAutomation,
  isFailure,
} from "@/lib/automation/request";
import { addDays, zonedToday } from "@/lib/date";
import { buildHabitViews } from "@/lib/habit-view";
import { getUserDatePrefs } from "@/lib/user-settings";

const ROUTE = "GET /api/automation/habits";

/**
 * Habits still open today, with the streaks they are protecting.
 *
 * Enough for both habit automations in the guide: an evening check that stays
 * silent unless something is unchecked, and a streak rescue that only speaks
 * when a real streak is about to end. `quiet` and `atRisk` are computed here so
 * every flow makes that call the same way.
 *
 * Read-only. Identity comes from the token.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: ROUTE });
  if (isFailure(auth)) return auth.response;

  try {
    const { timeZone, weekStartsOn } = await getUserDatePrefs(auth.userId);
    const now = new Date();
    const today = zonedToday(now, timeZone);

    const [habits, entries] = await Promise.all([
      habitsRepo.listHabitsWithSchedule(auth.userId),
      habitsRepo.listEntriesInRange(auth.userId, { from: addDays(today, -400), to: today }),
    ]);

    const views = buildHabitViews({ habits, entries, today, weekStartsOn, timeZone });

    return await finishAutomation(
      auth,
      ROUTE,
      automationJson(toHabitsDuePayload({ views, today, timeZone, now })),
    );
  } catch (error) {
    await finishAutomation(auth, ROUTE, new Response(null, { status: 500 }));
    return automationError(ROUTE, error);
  }
}
