"use client";

import { motion } from "motion/react";
import { Plus, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Weekday } from "@/lib/date";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { listContainer, listItem } from "@/lib/motion";

import { archiveGoalAction, createGoalAction, updateGoalAction } from "@/app/(app)/goals/actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { GoalWithCounts } from "@/db/repositories/goals";
import type { LifeArea, Task } from "@/db";
import { GOAL_TIMEFRAME_ORDER, goalTimeframeConfig } from "@/lib/goals";
import type { GoalTimeframe } from "@/db/schema/enums";
import type { GoalFormInput } from "@/lib/validations/goal";
import { cn } from "@/lib/utils";

import { GoalCard } from "./goal-card";
import { GoalDetailPanel } from "./goal-detail-panel";
import { GoalFormModal, type LifeAreaOption, type ParentOption } from "./goal-form-modal";

type TabKey = "all" | GoalTimeframe;

/** Collect a goal's descendant ids so a goal can't be nested under its own child. */
function descendantIds(goals: GoalWithCounts[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const goal of goals) {
    if (goal.parentGoalId) {
      const list = childrenByParent.get(goal.parentGoalId) ?? [];
      list.push(goal.id);
      childrenByParent.set(goal.parentGoalId, list);
    }
  }
  const result = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return result;
}

export function GoalsView({
  goals,
  lifeAreas,
  tasks = [],
  timeZone,
  weekStartsOn,
}: {
  goals: GoalWithCounts[];
  lifeAreas: LifeArea[];
  tasks?: Task[];
  /** The user's saved timezone, so "today" is their today. */
  timeZone?: string;
  /** Their saved week start, so the picker's week matches theirs. */
  weekStartsOn?: Weekday;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GoalWithCounts | null>(null);
  const [archiving, setArchiving] = useState<GoalWithCounts | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [optimisticGoals, removeOptimistically] = useOptimistic(
    goals,
    (state, archivedId: string) => state.filter((goal) => goal.id !== archivedId),
  );

  const lifeAreaMap = useMemo(
    () => new Map(lifeAreas.map((area) => [area.id, area])),
    [lifeAreas],
  );
  const lifeAreaOptions: LifeAreaOption[] = useMemo(
    () => lifeAreas.map((area) => ({ id: area.id, name: area.name })),
    [lifeAreas],
  );
  const goalTitleById = useMemo(
    () => new Map(optimisticGoals.map((goal) => [goal.id, goal.title])),
    [optimisticGoals],
  );

  const visibleGoals = optimisticGoals.filter(
    (goal) => tab === "all" || goal.timeframe === tab,
  );

  const subGoalCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const goal of optimisticGoals) {
      if (goal.parentGoalId) map.set(goal.parentGoalId, (map.get(goal.parentGoalId) ?? 0) + 1);
    }
    return map;
  }, [optimisticGoals]);

  const detailGoal = detailId ? optimisticGoals.find((g) => g.id === detailId) ?? null : null;
  const detailSubGoals = useMemo(
    () => (detailId ? optimisticGoals.filter((g) => g.parentGoalId === detailId) : []),
    [optimisticGoals, detailId],
  );
  const detailTasks = useMemo(
    () => (detailId ? tasks.filter((t) => t.goalId === detailId) : []),
    [tasks, detailId],
  );

  const parentOptions: ParentOption[] = useMemo(() => {
    const excluded = editing
      ? new Set<string>([editing.id, ...descendantIds(optimisticGoals, editing.id)])
      : new Set<string>();
    return optimisticGoals
      .filter((goal) => !excluded.has(goal.id))
      .map((goal) => ({ id: goal.id, title: goal.title }));
  }, [optimisticGoals, editing]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(goal: GoalWithCounts) {
    setEditing(goal);
    setFormOpen(true);
  }

  async function handleCreate(values: GoalFormInput) {
    const result = await createGoalAction(values);
    if (result.ok) {
      toast.success(`Created "${result.data.title}"`);
      setFormOpen(false);
    }
    return result;
  }

  async function handleUpdate(values: GoalFormInput) {
    if (!editing) return { ok: false as const, error: "Nothing to update." };
    const result = await updateGoalAction(editing.id, values);
    if (result.ok) {
      toast.success(`Updated "${result.data.title}"`);
      setFormOpen(false);
    }
    return result;
  }

  function confirmArchive() {
    const goal = archiving;
    if (!goal) return;
    setArchiving(null);
    startTransition(async () => {
      removeOptimistically(goal.id);
      const result = await archiveGoalAction(goal.id);
      if (result.ok) toast.success(`Archived "${goal.title}"`);
      else toast.error(result.error);
    });
  }

  const newGoalButton = (
    <Button data-testid="new-goal" onClick={openCreate}>
      <Plus />
      Add Goal
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My Goals"
        description="Track and manage your objectives across every life area and timeframe."
        action={optimisticGoals.length > 0 ? newGoalButton : undefined}
      />

      {optimisticGoals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="Goals turn your life areas into concrete objectives. Create your first one and choose whether its progress comes from tasks or is set by hand."
          action={
            <Button data-testid="new-goal" onClick={openCreate}>
              <Plus />
              Create your first goal
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto border-b border-separator">
            <ul className="flex min-w-max gap-5" role="tablist" aria-label="Filter goals by timeframe">
              {GOAL_TIMEFRAME_ORDER.map((tf) => (
                <li key={tf}>
                  <TabButton active={tab === tf} onClick={() => setTab(tf)}>
                    {goalTimeframeConfig[tf].tab}
                  </TabButton>
                </li>
              ))}
              <li>
                <TabButton active={tab === "all"} onClick={() => setTab("all")}>
                  All Goals
                </TabButton>
              </li>
            </ul>
          </div>

          {visibleGoals.length === 0 ? (
            /* A well sitting on the CANVAS, not inside a card: it needs its own
               border, since `surface-secondary` matches the canvas in light mode. */
            <p className="rounded-2xl border border-separator-opaque bg-surface px-6 py-10 text-center text-callout text-label-secondary">
              No goals in this timeframe yet.
            </p>
          ) : null}

          <motion.div
            key={tab}
            variants={listContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          >
            {visibleGoals.map((goal) => (
              <motion.div key={goal.id} variants={listItem} layout>
                <GoalCard
                  goal={goal}
                  lifeArea={goal.lifeAreaId ? lifeAreaMap.get(goal.lifeAreaId) ?? null : null}
                  parentTitle={goal.parentGoalId ? goalTitleById.get(goal.parentGoalId) ?? null : null}
                  subGoalCount={subGoalCounts.get(goal.id) ?? 0}
                  onOpen={(g) => setDetailId(g.id)}
                  onEdit={openEdit}
                  onArchive={setArchiving}
                />
              </motion.div>
            ))}

            <button
              type="button"
              onClick={openCreate}
              className="group flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-gray-3 p-5 text-label-secondary transition-colors hover:border-blue/50 hover:bg-surface-hover"
            >
              <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-surface-secondary text-label-secondary transition-colors group-hover:bg-blue group-hover:text-white">
                <Plus className="size-5" aria-hidden />
              </span>
              <span className="text-headline text-label">Create New Goal</span>
              <span className="mt-1 max-w-52 text-center text-callout">
                Define a new objective and break it into steps.
              </span>
            </button>
          </motion.div>
        </div>
      )}

      <GoalDetailPanel
        goal={detailGoal}
        subGoals={detailSubGoals}
        tasks={detailTasks}
        lifeAreas={lifeAreas}
        onClose={() => setDetailId(null)}
        onEdit={(goal) => {
          setDetailId(null);
          openEdit(goal);
        }}
        onOpenSubGoal={(goal) => setDetailId(goal.id)}
        // Creating the task where it belongs: the To-dos form opens with this
        // goal already selected, so the link is never forgotten.
        onAddTask={(goal) => router.push(`/tasks?new=1&goalId=${goal.id}`)}
      />

      <GoalFormModal
        open={formOpen}
        mode={editing ? "edit" : "create"}
        goal={editing}
        lifeAreas={lifeAreaOptions}
        parentOptions={parentOptions}
        timeZone={timeZone}
        weekStartsOn={weekStartsOn}
        onSubmit={editing ? handleUpdate : handleCreate}
        onClose={() => setFormOpen(false)}
      />

      <Modal
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        title="Archive this goal?"
        description={
          archiving
            ? `"${archiving.title}" will be hidden from your active goals. Sub-goals are archived with it. You can restore it later; nothing is permanently deleted.`
            : undefined
        }
      >
        <div className="flex items-center justify-end gap-3 px-6 py-5">
          <Button variant="ghost" onClick={() => setArchiving(null)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmArchive}>
            Archive
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "touch-target cursor-pointer whitespace-nowrap py-2.5 text-callout font-medium transition-colors",
        active
          ? "border-b-2 border-blue text-blue"
          : "text-label-secondary hover:text-label",
      )}
    >
      {children}
    </button>
  );
}
