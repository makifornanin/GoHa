import { FocusView } from "@/components/focus/focus-view";
import { focusRepo, goalsRepo, lifeAreasRepo, tasksRepo } from "@/db";
import { startOfWeek, zonedToday } from "@/lib/date";
import { aggregateFocus } from "@/lib/focus";
import { reconcileStaleFocusSessions } from "@/lib/focus-reconcile";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "Focus" };

export default async function FocusPage({
  searchParams,
}: {
  searchParams: Promise<{ taskId?: string }>;
}) {
  const user = await requireUser();

  // Close out any session left running past the abandon threshold before we read.
  await reconcileStaleFocusSessions(user.id);

  const { timeZone, weekStartsOn } = await getUserDatePrefs(user.id);
  const today = zonedToday(new Date(), timeZone);
  const weekStart = startOfWeek(today, weekStartsOn);
  const { taskId: preselectTaskId } = await searchParams;

  const [activeSession, tasks, goals, lifeAreas, weekSessions, recent] = await Promise.all([
    focusRepo.getActiveFocusSession(user.id),
    tasksRepo.listTasksForUser(user.id),
    goalsRepo.listGoals(user.id),
    lifeAreasRepo.listLifeAreas(user.id),
    focusRepo.listCompletedSessionsInRange(user.id, { from: weekStart, to: today }),
    focusRepo.listRecentSessions(user.id),
  ]);

  const tasksById = new Map(
    tasks.map((t) => [t.id, { title: t.title, goalId: t.goalId, lifeAreaId: t.lifeAreaId }]),
  );
  const goalsById = new Map(goals.map((g) => [g.id, g.title]));
  const lifeAreasById = new Map(lifeAreas.map((a) => [a.id, a.name]));

  const stats = aggregateFocus({
    sessions: weekSessions.map((s) => ({
      taskId: s.taskId,
      sessionDate: s.sessionDate,
      durationSeconds: s.durationSeconds,
    })),
    today,
    tasksById,
    goalsById,
    lifeAreasById,
  });

  const candidateTasks = tasks
    .filter((t) => t.status !== "completed" && t.status !== "cancelled")
    .map((t) => ({ id: t.id, title: t.title }));
  const allTaskTitles = tasks.map((t) => ({ id: t.id, title: t.title }));
  const validPreselect =
    preselectTaskId && tasks.some((t) => t.id === preselectTaskId) ? preselectTaskId : null;

  return (
    <FocusView
      activeSession={activeSession}
      candidateTasks={candidateTasks}
      allTaskTitles={allTaskTitles}
      stats={stats}
      recent={recent}
      preselectTaskId={validPreselect}
    />
  );
}
