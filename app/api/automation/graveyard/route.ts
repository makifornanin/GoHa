import { automationRepo, goalsRepo, tasksRepo } from "@/db";
import { buildGraveyardPayload, countRepeats, graveyardKey } from "@/lib/automation/graveyard";
import {
  authenticateAutomation,
  automationError,
  automationJson,
  finishAutomation,
  isFailure,
  sabbathSilence,
} from "@/lib/automation/request";

const ROUTE = "GET /api/automation/graveyard";

export const dynamic = "force-dynamic";

/**
 * Work that has stopped moving: stuck in progress, long overdue, or rotting
 * undated in the inbox.
 *
 * A digest that only recommends. Nothing here writes, and there is no bulk
 * action: reschedule, cancel, break down or link to a goal are decisions, and
 * automating a decision is how a backlog gets tidied instead of resolved.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: ROUTE });
  if (isFailure(auth)) return auth.response;

  try {
    const { settings, context } = auth;
    if (context.isSabbath) {
      return await finishAutomation(auth, ROUTE, sabbathSilence(auth));
    }

    const [tasks, goals, priorDigests] = await Promise.all([
      tasksRepo.listTasksForUser(auth.userId),
      goalsRepo.listGoals(auth.userId),
      // Twelve weeks of history is plenty to spot a third appearance.
      automationRepo.listNotificationsByKind(auth.userId, "graveyard", 12),
    ]);

    const payload = buildGraveyardPayload({
      tasks,
      goalTitles: new Map(goals.map((goal) => [goal.id, goal.title])),
      repeats: countRepeats(priorDigests.map((entry) => entry.payload)),
      today: context.localDate,
      timeZone: settings.timezone,
      isSabbath: false,
      now: new Date(),
    });

    return await finishAutomation(
      auth,
      ROUTE,
      automationJson({
        ...payload,
        // The key the workflow should claim before sending this week's digest.
        dedupeKey: graveyardKey(context.localDate),
      }),
    );
  } catch (error) {
    await finishAutomation(auth, ROUTE, new Response(null, { status: 500 }));
    return automationError(ROUTE, error);
  }
}
