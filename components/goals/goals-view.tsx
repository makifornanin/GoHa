"use client";

import { motion } from "motion/react";
import { Plus, Target } from "lucide-react";
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
import type { LifeArea } from "@/db";
import { descendantIds, goalProgressBreakdown } from "@/lib/goal-tree";
import { useCreateSignal } from "@/lib/use-create-signal";
import { GOAL_TIMEFRAME_ORDER, goalTimeframeConfig } from "@/lib/goals";
import type { GoalTimeframe } from "@/db/schema/enums";
import type { GoalFormInput } from "@/lib/validations/goal";
import { cn } from "@/lib/utils";

import { GoalCard } from "./goal-card";
import { GoalFormModal, type LifeAreaOption, type ParentOption } from "./goal-form-modal";

type TabKey = "all" | GoalTimeframe;

/**
 * The goals board.
 *
 * It shows GOALS, and a goal's subgoals appear underneath it rather than beside
 * it. The previous grid put every row of the table in one flat list, so "Find a
 * new job" and "Finish resume" were two identical cards with no visible
 * relationship except a small "Part of" line, and the board grew by four cards
 * every time someone broke a goal down properly. Punishing the behaviour the
 * app exists to encourage is the wrong incentive.
 *
 * Opening a goal now goes to `/goals/[goalId]`, a real page with a breadcrumb,
 * its milestones, its next actions and its habits.
 */
export function GoalsView({
  goals,
  lifeAreas,
  timeZone,
  weekStartsOn,
  openCreateOnMount = false,
  defaultParentGoalId,
  defaultLifeAreaId,
}: {
  goals: GoalWithCounts[];
  lifeAreas: LifeArea[];
  /** The user's saved timezone, so "today" is their today. */
  timeZone?: string;
  /** Their saved week start, so the picker's week matches theirs. */
  weekStartsOn?: Weekday;
  /** `?new=1` from the Add menu or the command palette. */
  openCreateOnMount?: boolean;
  /** `?parentGoalId=` — the Add menu opened this asking for a subgoal. */
  defaultParentGoalId?: string;
  defaultLifeAreaId?: string;
}) {
  const [tab, setTab] = useState<TabKey>("all");
  const [editing, setEditing] = useState<GoalWithCounts | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | null>(defaultParentGoalId ?? null);
  const [archiving, setArchiving] = useState<GoalWithCounts | null>(null);
  const [, startTransition] = useTransition();

  // "+ Add > Goal" (or Subgoal) from anywhere in the shell lands here with
  // `?new=1`; the hook opens the form and spends the signal. See its comments.
  const [formOpen, setFormOpen] = useCreateSignal(openCreateOnMount, "/goals", () => {
    setEditing(null);
    setCreatingUnder(defaultParentGoalId ?? null);
  });

  const [optimisticGoals, removeOptimistically] = useOptimistic(
    goals,
    (state, archivedIds: Set<string>) => state.filter((goal) => !archivedIds.has(goal.id)),
  );

  const lifeAreaMap = useMemo(
    () => new Map(lifeAreas.map((area) => [area.id, area])),
    [lifeAreas],
  );
  const lifeAreaOptions: LifeAreaOption[] = useMemo(
    () => lifeAreas.map((area) => ({ id: area.id, name: area.name })),
    [lifeAreas],
  );

  /*
   * Top-level goals only. Their subgoals are rendered inside the card that owns
   * them, so a subgoal appears exactly once on this screen and always beneath
   * its parent.
   */
  const topLevel = optimisticGoals.filter((goal) => !goal.parentGoalId);
  const visibleGoals = topLevel.filter((goal) => tab === "all" || goal.timeframe === tab);

  const subgoalsByParent = useMemo(() => {
    const map = new Map<string, GoalWithCounts[]>();
    for (const goal of optimisticGoals) {
      if (!goal.parentGoalId) continue;
      const list = map.get(goal.parentGoalId);
      if (list) list.push(goal);
      else map.set(goal.parentGoalId, [goal]);
    }
    return map;
  }, [optimisticGoals]);

  /** Only top-level goals can be a parent, and never the goal being edited. */
  const parentOptions: ParentOption[] = useMemo(() => {
    const excluded = editing
      ? new Set<string>([editing.id, ...descendantIds(optimisticGoals, editing.id)])
      : new Set<string>();
    return optimisticGoals
      .filter((goal) => !goal.parentGoalId && !excluded.has(goal.id))
      .map((goal) => ({ id: goal.id, title: goal.title }));
  }, [optimisticGoals, editing]);

  function openCreate(parentGoalId: string | null = null) {
    setEditing(null);
    setCreatingUnder(parentGoalId);
    setFormOpen(true);
  }

  function openEdit(goal: GoalWithCounts) {
    setEditing(goal);
    setCreatingUnder(null);
    setFormOpen(true);
  }

  async function handleCreate(values: GoalFormInput) {
    const result = await createGoalAction(values);
    if (result.ok) {
      toast.success(`Created "${result.data.title}"`);
      setFormOpen(false);
      setCreatingUnder(null);
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
      // Subgoals go with the parent, which is what the dialog has always said.
      removeOptimistically(new Set([goal.id, ...descendantIds(optimisticGoals, goal.id)]));
      const result = await archiveGoalAction(goal.id);
      if (result.ok) toast.success(`Archived "${goal.title}"`);
      else toast.error(result.error);
    });
  }

  const creatingSubgoal = Boolean(creatingUnder);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Goals"
        description="An outcome, broken into milestones, broken into to-dos you can actually do."
        /*
         * A direct button, NOT the shared menu.
         *
         * The sidebar already carries a root-context "+ Add" about 80px away,
         * and putting a second root-context menu here made two identical
         * controls with identical contents compete inside one viewport, which
         * is the duplication the shell was reorganised to remove. A page about
         * one kind of record gets the direct form, exactly as the subgoal page
         * shows "Add to-do" rather than a menu of one.
         */
        action={
          topLevel.length > 0 ? (
            <Button data-testid="new-goal" onClick={() => openCreate(null)}>
              <Plus />
              Add goal
            </Button>
          ) : undefined
        }
      />

      {topLevel.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="A goal is an outcome worth working toward, like “Find a new job”. You break it into subgoals, and those into to-dos that land on your day."
          action={
            <Button data-testid="new-goal" onClick={() => openCreate(null)}>
              <Plus />
              Create your first goal
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto border-b border-separator">
            <ul className="flex min-w-max gap-5" role="tablist" aria-label="Filter goals by timeframe">
              <li>
                <TabButton active={tab === "all"} onClick={() => setTab("all")}>
                  All Goals
                </TabButton>
              </li>
              {GOAL_TIMEFRAME_ORDER.map((tf) => (
                <li key={tf}>
                  <TabButton active={tab === tf} onClick={() => setTab(tf)}>
                    {goalTimeframeConfig[tf].tab}
                  </TabButton>
                </li>
              ))}
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
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {visibleGoals.map((goal) => (
              <motion.div key={goal.id} variants={listItem} layout>
                <GoalCard
                  goal={goal}
                  progress={goalProgressBreakdown(optimisticGoals, goal.id)}
                  subgoals={subgoalsByParent.get(goal.id) ?? []}
                  lifeArea={goal.lifeAreaId ? (lifeAreaMap.get(goal.lifeAreaId) ?? null) : null}
                  onEdit={openEdit}
                  onArchive={setArchiving}
                  onAddSubgoal={(g) => openCreate(g.id)}
                />
              </motion.div>
            ))}

            <button
              type="button"
              onClick={() => openCreate(null)}
              data-testid="new-goal"
              className="group flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-gray-3 p-5 text-label-secondary transition-colors hover:border-blue/50 hover:bg-surface-hover"
            >
              <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-surface-secondary text-label-secondary transition-colors group-hover:bg-blue group-hover:text-white">
                <Plus className="size-5" aria-hidden />
              </span>
              <span className="text-headline text-label">New goal</span>
              <span className="mt-1 max-w-52 text-center text-callout">
                Name an outcome, then break it into milestones.
              </span>
            </button>
          </motion.div>
        </div>
      )}

      <GoalFormModal
        open={formOpen}
        mode={editing ? "edit" : "create"}
        goal={editing}
        level={creatingSubgoal ? "subgoal" : "goal"}
        defaultParentGoalId={creatingUnder}
        defaultLifeAreaId={
          creatingUnder
            ? (optimisticGoals.find((g) => g.id === creatingUnder)?.lifeAreaId ?? null)
            : (defaultLifeAreaId ?? null)
        }
        lifeAreas={lifeAreaOptions}
        parentOptions={parentOptions}
        timeZone={timeZone}
        weekStartsOn={weekStartsOn}
        onSubmit={editing ? handleUpdate : handleCreate}
        onClose={() => {
          setFormOpen(false);
          setCreatingUnder(null);
        }}
      />

      <Modal
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        title="Archive this goal?"
        description={
          archiving
            ? `"${archiving.title}" and its subgoals will be hidden from your board. Your to-dos are kept. You can restore any of them from Settings; nothing is deleted.`
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
