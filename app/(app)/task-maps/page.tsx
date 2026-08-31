import { PageHeader } from "@/components/page-header";
import { TaskMapsWorkspace } from "@/components/task-maps/task-maps-workspace";
import { taskMapsRepo, tasksRepo } from "@/db";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Task Map" };

export default async function TaskMapsPage({
  searchParams,
}: {
  searchParams: Promise<{ map?: string }>;
}) {
  const user = await requireUser();
  const { map: requestedId } = await searchParams;

  const [maps, tasks] = await Promise.all([
    taskMapsRepo.listTaskMaps(user.id, { includeArchived: true }),
    tasksRepo.listTasksForUser(user.id),
  ]);

  // Default the selection to the requested map, else the first active map, else
  // the first archived one, so a returning user always lands on something.
  const firstActive = maps.find((m) => !m.isArchived);
  const activeMapId =
    (requestedId && maps.some((m) => m.id === requestedId) ? requestedId : null) ??
    firstActive?.id ??
    maps[0]?.id ??
    null;

  const graph = activeMapId ? await taskMapsRepo.getTaskMapGraph(user.id, activeMapId) : null;
  // Status and priority travel with each task so a linked node can show the
  // work's real state on the canvas instead of a drawing that goes stale.
  const taskOptions = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Task Map"
        description="Sketch how your to-dos and ideas connect. Drag to arrange, link nodes to your to-dos, and connect the ones that depend on each other."
      />
      <TaskMapsWorkspace maps={maps} graph={graph} activeMapId={activeMapId} tasks={taskOptions} />
    </div>
  );
}
