"use client";

import { motion } from "motion/react";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Flag,
  History,
  ListChecks,
  Pencil,
  Repeat,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { archiveGoalAction, createGoalAction, updateGoalAction } from "@/app/(app)/goals/actions";
import { completeTaskAction, reopenTaskAction } from "@/app/(app)/tasks/actions";
import { AddMenu } from "@/components/shell/add-menu";
import { LifeAreaIcon } from "@/components/life-areas/icon";
import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import type { Habit, LifeArea, Task } from "@/db";
import type { GoalWithCounts } from "@/db/repositories/goals";
import { formatIsoDateMedium, type Weekday } from "@/lib/date";
import { ancestorPath, goalLevel, goalProgressBreakdown } from "@/lib/goal-tree";
import { goalLevelConfig, goalStatusConfig, goalTimeframeConfig } from "@/lib/goals";
import { lifeAreaColorConfig, resolveColorKey } from "@/lib/life-areas";
import { listContainer, listItem, spring } from "@/lib/motion";
import { formatEstimate, taskPriorityConfig } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import type { GoalFormInput } from "@/lib/validations/goal";

import { GoalFormModal, type LifeAreaOption, type ParentOption } from "./goal-form-modal";

export type GoalProgressEntry = {
  id: string;
  progress: number;
  note: string | null;
  createdAt: string;
};

/**
 * The goal detail screen: what am I trying to achieve, why does it matter, what
 * has to happen, what do I do next, and am I moving.
 *
 * Laid out in that order deliberately. The old drawer opened on a field list
 * (timeframe, starts, target) and put the subgoals and to-dos below the fold,
 * which answers "what is stored about this goal" rather than "what do I do
 * about it". Dates are real but they are reference, so they sit in the header
 * meta line and the body belongs to the work.
 */
export function GoalDetailView({
  goal,
  goals,
  lifeAreas,
  tasks,
  habits,
  progressUpdates,
  timeZone,
  weekStartsOn,
}: {
  goal: GoalWithCounts;
  /** Every goal the user owns, so the tree can be read without another query. */
  goals: GoalWithCounts[];
  lifeAreas: LifeArea[];
  /** To-dos under this goal or any of its subgoals. */
  tasks: Task[];
  habits: Habit[];
  progressUpdates: GoalProgressEntry[];
  timeZone?: string;
  weekStartsOn?: Weekday;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [addingSubgoal, setAddingSubgoal] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [, startTransition] = useTransition();

  const [optimisticTasks, toggleTask] = useOptimistic(
    tasks,
    (state, change: { id: string; done: boolean }) =>
      state.map((task) =>
        task.id === change.id
          ? {
              ...task,
              status: change.done ? ("completed" as const) : ("todo" as const),
              completedAt: change.done ? new Date() : null,
            }
          : task,
      ),
  );

  const level = goalLevel(goal);
  const levelMeta = goalLevelConfig[level];
  const status = goalStatusConfig[goal.status];
  const breakdown = useMemo(() => goalProgressBreakdown(goals, goal.id), [goals, goal.id]);

  const area = goal.lifeAreaId ? (lifeAreas.find((a) => a.id === goal.lifeAreaId) ?? null) : null;
  const areaColor = area ? lifeAreaColorConfig[resolveColorKey(area.color, area.id)] : null;

  const subgoals = useMemo(
    () => goals.filter((entry) => entry.parentGoalId === goal.id && !entry.isArchived),
    [goals, goal.id],
  );
  const goalTitleById = useMemo(() => new Map(goals.map((g) => [g.id, g.title])), [goals]);

  /* Breadcrumb: the chain the product promises, Career > Find a new job > this.
     The life area heads it because that is where the chain actually starts;
     when a goal has none, the trail starts at the goals board instead so the
     first crumb is still somewhere you can go. */
  const crumbs: Crumb[] = [
    area
      ? {
          label: area.name,
          href: "/life-areas",
          icon: <LifeAreaIcon iconKey={area.icon} className="size-3" />,
        }
      : { label: "Goals", href: "/goals" },
    ...ancestorPath(goals, goal.id)
      .slice(0, -1)
      .map((ancestor) => ({ label: ancestor.title, href: `/goals/${ancestor.id}` })),
    { label: goal.title },
  ];

  const openTasks = optimisticTasks.filter(
    (task) => task.status === "todo" || task.status === "in_progress",
  );
  const doneTasks = optimisticTasks
    .filter((task) => task.status === "completed")
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));

  const nextActions = [...openTasks].sort(
    (a, b) =>
      taskPriorityConfig[b.priority].weight - taskPriorityConfig[a.priority].weight ||
      (a.scheduledFor ?? "9999").localeCompare(b.scheduledFor ?? "9999"),
  );

  async function handleUpdate(values: GoalFormInput) {
    const result = await updateGoalAction(goal.id, values);
    if (result.ok) {
      toast.success(`Updated "${result.data.title}"`);
      setEditing(false);
    }
    return result;
  }

  async function handleCreateSubgoal(values: GoalFormInput) {
    const result = await createGoalAction(values);
    if (result.ok) {
      toast.success(`Added "${result.data.title}"`);
      setAddingSubgoal(false);
    }
    return result;
  }

  function confirmArchive() {
    setArchiving(false);
    startTransition(async () => {
      const result = await archiveGoalAction(goal.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const extra = result.data.archivedCount - 1;
      toast.success(
        extra > 0
          ? `Archived "${goal.title}" and ${extra} subgoal${extra === 1 ? "" : "s"}`
          : `Archived "${goal.title}"`,
      );
      router.push("/goals");
    });
  }

  function setTaskDone(task: Task, done: boolean) {
    startTransition(async () => {
      toggleTask({ id: task.id, done });
      const result = done ? await completeTaskAction(task.id) : await reopenTaskAction(task.id);
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={crumbs} />

      {goal.isArchived ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-orange/30 bg-orange/10 px-4 py-3 text-callout text-label"
        >
          <Archive className="size-4 shrink-0 text-orange" aria-hidden />
          <span className="min-w-0 flex-1">
            This {levelMeta.label.toLowerCase()} is archived. It is hidden from your board and does
            not count toward anything.
          </span>
          <Link
            href="/settings#archive"
            className="touch-target inline-flex items-center gap-1.5 text-callout font-medium text-blue hover:underline"
          >
            <ArchiveRestore className="size-4" aria-hidden />
            Restore in Settings
          </Link>
        </div>
      ) : null}

      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-footnote font-medium",
                levelMeta.chip,
              )}
            >
              {level === "goal" ? (
                <Target className="size-3" aria-hidden />
              ) : (
                <Flag className="size-3" aria-hidden />
              )}
              {levelMeta.label}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-sm px-1.5 py-0.5 text-footnote",
                status.badge,
              )}
            >
              {status.label}
            </span>
            {area && areaColor ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-footnote",
                  areaColor.tile,
                )}
              >
                <LifeAreaIcon iconKey={area.icon} className="size-3" />
                {area.name}
              </span>
            ) : null}
          </div>

          <h1 className="text-title-2 text-label">{goal.title}</h1>

          {goal.description ? (
            <p className="mt-2 max-w-2xl text-callout leading-relaxed text-label-secondary">
              {goal.description}
            </p>
          ) : (
            <p className="mt-2 max-w-2xl text-callout text-label-tertiary">
              No description yet. Editing it is a good place to say why this matters.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-footnote text-label-secondary">
            {goal.timeframe ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden />
                {goalTimeframeConfig[goal.timeframe].label}
              </span>
            ) : null}
            {formatIsoDateMedium(goal.targetDate) ? (
              <span className="inline-flex items-center gap-1.5">
                <Flag className="size-3.5" aria-hidden />
                Target{" "}
                <span className="font-mono tabular-nums">
                  {formatIsoDateMedium(goal.targetDate)}
                </span>
              </span>
            ) : null}
            {formatIsoDateMedium(goal.startDate) ? (
              <span className="inline-flex items-center gap-1.5">
                Started{" "}
                <span className="font-mono tabular-nums">
                  {formatIsoDateMedium(goal.startDate)}
                </span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setArchiving(true)}>
            <Archive className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">Archive</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden />
            Edit
          </Button>
          {/* Context decides the menu: inside a goal you may add a subgoal, a
              to-do or a habit; inside a subgoal only a to-do makes sense. */}
          <AddMenu
            context={level === "goal" ? "goal" : "subgoal"}
            goalId={goal.id}
            lifeAreaId={goal.lifeAreaId}
            onAddSubgoal={() => setAddingSubgoal(true)}
          />
        </div>
      </header>

      {/* Progress */}
      <Card>
        <CardContent className="py-4">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-subhead text-label-secondary">Progress</p>
              <p className="mt-0.5 text-footnote text-label-tertiary">{progressHint(breakdown)}</p>
            </div>
            <span className="shrink-0 font-mono text-title-1 tabular-nums text-label">
              {breakdown.percent}%
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-fill-tertiary">
            <motion.div
              className={cn("h-full rounded-full", areaColor ? areaColor.dot : status.bar)}
              initial={{ width: 0 }}
              animate={{ width: `${breakdown.percent}%` }}
              transition={spring.smooth}
            />
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-separator pt-3 text-center">
            <Stat
              label="To-dos done"
              value={`${breakdown.rolled.completed}/${Math.max(0, breakdown.rolled.total - breakdown.rolled.cancelled)}`}
            />
            <Stat
              label={levelMeta.label === "Goal" ? "Subgoals done" : "Open to-dos"}
              value={
                level === "goal"
                  ? `${breakdown.subgoalsCompleted}/${breakdown.subgoalCount}`
                  : String(openTasks.length)
              }
            />
            <Stat label="Habits linked" value={String(habits.length)} />
          </dl>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Subgoals, for a top-level goal only. A subgoal cannot have its
              own, so the section would be a permanently empty box. */}
          {level === "goal" ? (
            <Section
              icon={Flag}
              title="Subgoals"
              subtitle="The milestones this goal is made of."
              count={subgoals.length}
              action={
                goal.isArchived ? null : (
                  <Button variant="ghost" size="sm" onClick={() => setAddingSubgoal(true)}>
                    Add subgoal
                  </Button>
                )
              }
            >
              {subgoals.length === 0 ? (
                <Hint>
                  Nothing breaks this goal down yet. A subgoal is a checkpoint you could actually
                  finish, like &ldquo;Finish resume&rdquo; under &ldquo;Find a new job&rdquo;.
                </Hint>
              ) : (
                <motion.ul
                  variants={listContainer}
                  initial="hidden"
                  animate="visible"
                  className="flex flex-col gap-2"
                >
                  {subgoals.map((sub) => {
                    const subProgress = goalProgressBreakdown(goals, sub.id);
                    const subStatus = goalStatusConfig[sub.status];
                    return (
                      <motion.li key={sub.id} variants={listItem}>
                        <Link
                          href={`/goals/${sub.id}`}
                          className="group flex items-center gap-3 rounded-xl border border-separator-opaque bg-surface px-3 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-body text-label">{sub.title}</span>
                              <span
                                className={cn(
                                  "shrink-0 rounded-sm px-1.5 py-0.5 text-footnote",
                                  subStatus.badge,
                                )}
                              >
                                {subStatus.label}
                              </span>
                            </span>
                            <span className="mt-1.5 flex items-center gap-2">
                              <span className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-fill-tertiary">
                                <span
                                  className={cn(
                                    "block h-full rounded-full",
                                    areaColor ? areaColor.dot : subStatus.bar,
                                  )}
                                  style={{ width: `${subProgress.percent}%` }}
                                />
                              </span>
                              <span className="shrink-0 font-mono text-footnote tabular-nums text-label-secondary">
                                {subProgress.percent}%
                              </span>
                              <span className="shrink-0 text-footnote text-label-tertiary">
                                {subProgress.rolled.completed}/
                                {Math.max(
                                  0,
                                  subProgress.rolled.total - subProgress.rolled.cancelled,
                                )}{" "}
                                to-dos
                              </span>
                            </span>
                          </span>
                          <ChevronRight
                            className="size-4 shrink-0 text-label-quaternary transition-transform group-hover:translate-x-0.5"
                            aria-hidden
                          />
                        </Link>
                      </motion.li>
                    );
                  })}
                </motion.ul>
              )}
            </Section>
          ) : null}

          {/* Next actions */}
          <Section
            icon={ListChecks}
            title="Next actions"
            subtitle={
              level === "goal"
                ? "Open to-dos under this goal and its subgoals."
                : "Open to-dos under this subgoal."
            }
            count={openTasks.length}
            action={
              goal.isArchived ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    router.push(
                      `/tasks?new=1&goalId=${goal.id}${goal.lifeAreaId ? `&lifeAreaId=${goal.lifeAreaId}` : ""}`,
                    )
                  }
                >
                  Add to-do
                </Button>
              )
            }
          >
            {openTasks.length === 0 ? (
              <Hint>
                {breakdown.rolled.total === 0
                  ? goal.progressMode === "auto"
                    ? "No to-dos yet, which is why this reads 0%: its progress is calculated from the work under it."
                    : "No to-dos yet. Progress is set by hand on this goal, so they are optional."
                  : "Everything here is done. Add the next to-do, or mark this complete."}
              </Hint>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {nextActions.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    /* Which subgoal it belongs to, but only when that is not
                       already obvious from the page you are on. */
                    parentLabel={
                      level === "goal" && task.goalId && task.goalId !== goal.id
                        ? (goalTitleById.get(task.goalId) ?? null)
                        : null
                    }
                    onToggle={(done) => setTaskDone(task, done)}
                    disabled={goal.isArchived}
                  />
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          {/* Linked habits */}
          <Section icon={Repeat} title="Habits" count={habits.length}>
            {habits.length === 0 ? (
              <Hint>
                No habits feed this yet. A habit is the repeated behaviour behind the outcome, like
                a daily run under &ldquo;Run a 10K&rdquo;.
              </Hint>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {habits.map((habit) => (
                  <li key={habit.id}>
                    <Link
                      href="/habits"
                      className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-surface-hover focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
                    >
                      <Repeat className="size-3.5 shrink-0 text-label-tertiary" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-body text-label">
                        {habit.name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Recent progress */}
          <Section icon={History} title="Recent progress">
            {doneTasks.length === 0 && progressUpdates.length === 0 ? (
              <Hint>Nothing finished under this yet. The first completed to-do shows up here.</Hint>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {doneTasks.slice(0, 5).map((task) => (
                  <li key={task.id} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-callout text-label">{task.title}</span>
                      {task.completionNote ? (
                        <span className="block text-footnote text-label-tertiary">
                          {task.completionNote}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
                {progressUpdates.slice(0, 3).map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2.5">
                    <Target className="mt-0.5 size-3.5 shrink-0 text-blue" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-callout text-label">
                        {entry.note ?? "Progress updated"}
                        <span className="ml-1.5 font-mono text-footnote tabular-nums text-label-secondary">
                          {entry.progress}%
                        </span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <GoalFormModal
        open={editing}
        mode="edit"
        goal={goal}
        lifeAreas={lifeAreas.map((a): LifeAreaOption => ({ id: a.id, name: a.name }))}
        parentOptions={parentOptionsFor(goals, goal.id)}
        timeZone={timeZone}
        weekStartsOn={weekStartsOn}
        onSubmit={handleUpdate}
        onClose={() => setEditing(false)}
      />

      <GoalFormModal
        open={addingSubgoal}
        mode="create"
        level="subgoal"
        defaultParentGoalId={goal.id}
        defaultLifeAreaId={goal.lifeAreaId}
        lifeAreas={lifeAreas.map((a): LifeAreaOption => ({ id: a.id, name: a.name }))}
        parentOptions={parentOptionsFor(goals, null)}
        timeZone={timeZone}
        weekStartsOn={weekStartsOn}
        onSubmit={handleCreateSubgoal}
        onClose={() => setAddingSubgoal(false)}
      />

      <Modal
        open={archiving}
        onClose={() => setArchiving(false)}
        title={`Archive this ${levelMeta.label.toLowerCase()}?`}
        description={
          subgoals.length > 0
            ? `"${goal.title}" and its ${subgoals.length} subgoal${subgoals.length === 1 ? "" : "s"} will be hidden from your board. Your to-dos are kept. You can restore any of them from Settings.`
            : `"${goal.title}" will be hidden from your board. Your to-dos are kept, and you can restore it from Settings.`
        }
      >
        <div className="flex items-center justify-end gap-3 px-6 py-5">
          <Button variant="ghost" onClick={() => setArchiving(false)}>
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

/** Parent choices that keep the tree two levels deep and cycle-free. */
function parentOptionsFor(goals: GoalWithCounts[], goalId: string | null): ParentOption[] {
  const excluded = new Set<string>();
  if (goalId) {
    excluded.add(goalId);
    for (const descendant of goals.filter((g) => g.parentGoalId === goalId)) {
      excluded.add(descendant.id);
    }
  }
  return goals
    .filter((g) => !g.isArchived && !g.parentGoalId && !excluded.has(g.id))
    .map((g) => ({ id: g.id, title: g.title }));
}

/** One line saying where the percentage came from, so it is never a mystery. */
function progressHint(breakdown: ReturnType<typeof goalProgressBreakdown>): string {
  if (breakdown.source === "completed") return "Marked complete.";
  if (breakdown.source === "manual") return "Set by hand. To-dos do not change it.";
  if (breakdown.source === "none") return "No to-dos to measure yet.";
  const counted = Math.max(0, breakdown.rolled.total - breakdown.rolled.cancelled);
  return breakdown.includesSubgoals
    ? `${breakdown.rolled.completed} of ${counted} to-dos done, including those under subgoals.`
    : `${breakdown.rolled.completed} of ${counted} to-dos done.`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-footnote text-label-tertiary">{label}</dt>
      <dd className="mt-0.5 font-mono text-headline tabular-nums text-label">{value}</dd>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-fill-quaternary px-3 py-3 text-callout leading-snug text-label-tertiary">
      {children}
    </p>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  count,
  action,
  children,
}: {
  icon: typeof Flag;
  title: string;
  subtitle?: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-subhead text-label-secondary">
            <Icon className="size-4" aria-hidden />
            {title}
            {typeof count === "number" && count > 0 ? (
              <span className="rounded-full bg-fill-tertiary px-1.5 py-0.5 font-mono text-footnote tabular-nums text-label">
                {count}
              </span>
            ) : null}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-footnote text-label-tertiary">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function TaskRow({
  task,
  parentLabel,
  onToggle,
  disabled,
}: {
  task: Task;
  parentLabel: string | null;
  onToggle: (done: boolean) => void;
  disabled?: boolean;
}) {
  const done = task.status === "completed";
  const priority = taskPriorityConfig[task.priority];
  return (
    <li className="flex items-center gap-3 rounded-xl border border-separator-opaque bg-surface px-3 py-2.5">
      <span className={cn("h-8 w-1 shrink-0 rounded-full", priority.accent)} aria-hidden />
      <input
        type="checkbox"
        checked={done}
        disabled={disabled}
        onChange={(event) => onToggle(event.target.checked)}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        className="hit-44 size-5 shrink-0 cursor-pointer accent-blue disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-body",
            done ? "text-label-tertiary line-through" : "text-label",
          )}
        >
          {task.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-footnote text-label-tertiary">
          {parentLabel ? (
            <span className="inline-flex items-center gap-1">
              <Flag className="size-3" aria-hidden />
              <span className="max-w-40 truncate">{parentLabel}</span>
            </span>
          ) : null}
          {task.scheduledFor ? (
            <span className="font-mono tabular-nums">{formatIsoDateMedium(task.scheduledFor)}</span>
          ) : null}
          {task.estimateMinutes ? (
            <span className="font-mono tabular-nums">{formatEstimate(task.estimateMinutes)}</span>
          ) : null}
        </span>
      </span>
      <span className={cn("shrink-0 text-footnote", priority.text)}>{priority.label}</span>
    </li>
  );
}
