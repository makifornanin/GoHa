import { automationRepo, focusRepo, habitsRepo, tasksRepo } from "@/db";
import {
  buildDuePayload,
  deadlineKey,
  focusOverrunKey,
  streakKey,
} from "@/lib/automation/due";
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
import { buildHabitViews } from "@/lib/habit-view";

const ROUTE = "GET /api/automation/due";

export const dynamic = "force-dynamic";

const MIN_WINDOW = 5;
const MAX_WINDOW = 1440;

/**
 * What falls due before the next poll, plus overdue work, runaway focus
 * sessions, and (in the evening) streaks about to break.
 *
 * Every item arrives with a dedupe key the workflow claims through /log before
 * sending. Items whose key is already claimed never appear at all, so two polls
 * running back to back produce one alert between them rather than one each.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: ROUTE });
  if (isFailure(auth)) return auth.response;

  try {
    const { settings, context } = auth;
    if (!settings.deadlineAlertsEnabled) {
      return await finishAutomation(auth, ROUTE, disabledSilence(auth, "deadlineAlertsEnabled"));
    }
    if (context.isSabbath) {
      return await finishAutomation(auth, ROUTE, sabbathSilence(auth));
    }

    const url = new URL(request.url);
    const requested = Number(url.searchParams.get("window"));
    const windowMinutes = Number.isFinite(requested)
      ? Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, Math.round(requested)))
      : settings.deadlineLeadMinutes;
    const evening = url.searchParams.get("evening") === "true";

    const today = context.localDate;
    const timeZone = settings.timezone;
    const now = new Date();

    const [tasks, activeSessions, habits, habitEntries] = await Promise.all([
      tasksRepo.listTasksForUser(auth.userId),
      focusRepo.listInProgressSessions(auth.userId),
      habitsRepo.listHabitsWithSchedule(auth.userId),
      habitsRepo.listEntriesInRange(auth.userId, { from: addDays(today, -400), to: today }),
    ]);

    const habitViews = evening
      ? buildHabitViews({
          habits,
          entries: habitEntries,
          today,
          weekStartsOn: (settings.weekStartsOn as Weekday) ?? 1,
          timeZone,
        })
      : [];

    /*
     * One query for every key this poll could possibly emit, before building
     * the payload. The alternative is a lookup per candidate, which on a busy
     * day is dozens of round trips to answer "have I already said this".
     */
    const candidateKeys = [
      ...tasks.filter((task) => task.dueAt).map((task) => deadlineKey(task)),
      ...activeSessions.map((session) => focusOverrunKey(session.id)),
      ...habitViews.map((view) => streakKey(view.habit.id, today)),
    ];
    const claimed = await automationRepo.claimedKeys(auth.userId, candidateKeys);

    const payload = buildDuePayload({
      tasks,
      activeSessions,
      taskTitles: new Map(tasks.map((task) => [task.id, task.title])),
      habitViews,
      claimed,
      windowMinutes,
      evening,
      today,
      timeZone,
      isSabbath: false,
      now,
    });

    return await finishAutomation(auth, ROUTE, automationJson(payload));
  } catch (error) {
    await finishAutomation(auth, ROUTE, new Response(null, { status: 500 }));
    return automationError(ROUTE, error);
  }
}
