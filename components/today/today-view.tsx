"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  CalendarClock,
  ListChecks,
  MoreHorizontal,
  Play,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  completeTaskAction,
  createSubtaskAction,
  deleteTaskAction,
  reopenTaskAction,
  updateTaskAction,
} from "@/app/(app)/tasks/actions";
import { addDailyPriorityAction, removeDailyPriorityAction } from "@/app/(app)/today/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";
import { ProgressRing } from "@/components/ui/progress";
import type { DailyPriority, HabitEntry, LifeArea, Task } from "@/db";
import type { GoalWithCounts } from "@/db/repositories/goals";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import type { TaskStatus } from "@/db/schema/enums";
import {
  formatIsoDateMedium,
  formatZonedDateTimeMedium,
  MANILA_TZ,
  type Weekday,
} from "@/lib/date";
import { deriveTodayHabits } from "@/lib/habit-view";
import { listEntrance, rowExit } from "@/lib/motion";
import { taskEffectiveDate } from "@/lib/task-buckets";
import { taskPriorityConfig } from "@/lib/tasks";
import { deriveTodayData } from "@/lib/today";
import { cn } from "@/lib/utils";

import { Celebration, type Milestone } from "@/components/celebration";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { deriveDaySignal } from "@/lib/today-brain";
import type { TaskFormInput } from "@/lib/validations/task";

import { ActiveGoalsCard } from "./active-goals-card";
import { BrainCard } from "./brain-card";
import { MomentumCard, type MomentumData } from "./momentum-card";
import { QuickAddTask } from "./quick-add-task";
import { TaskChecklistItem } from "./task-checklist-item";
import { TodayHabits } from "./today-habits";
import { TopPriorities } from "./top-priorities";

function PriorityChip({ task }: { task: Task }) {
  const meta = taskPriorityConfig[task.priority];
  return (
    <span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 text-footnote", meta.badge)}>
      {meta.label}
    </span>
  );
}

type OptimisticAction = { type: "status"; id: string; status: TaskStatus };

export function TodayView({
  userName,
  greetingPart,
  dateLabel,
  today,
  timeZone = MANILA_TZ,
  tasks,
  goals,
  priorities,
  habits,
  habitEntries,
  lifeAreas,
  subtasks = [],
  momentum,
  hour,
  allHabitEntries = [],
  weekStartsOn = 1,
}: {
  userName: string;
  greetingPart: string;
  dateLabel: string;
  today: string;
  timeZone?: string;
  tasks: Task[];
  goals: GoalWithCounts[];
  priorities: DailyPriority[];
  habits: HabitWithSchedule[];
  habitEntries: HabitEntry[];
  lifeAreas: LifeArea[];
  subtasks?: Task[];
  momentum: MomentumData;
  /** Local hour 0-23, resolved on the server in the user's timezone. */
  hour: number;
  /** Full habit history, used only for streak-milestone detection. */
  allHabitEntries?: HabitEntry[];
  weekStartsOn?: Weekday;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<Milestone | null>(null);

  const [optimisticTasks, applyOptimistic] = useOptimistic(tasks, (state, action: OptimisticAction) =>
    state.map((t) =>
      t.id === action.id
        ? { ...t, status: action.status, completedAt: action.status === "completed" ? new Date() : null }
        : t,
    ),
  );

  const data = useMemo(
    () => deriveTodayData({ today, tasks: optimisticTasks, goals, priorities }),
    [today, optimisticTasks, goals, priorities],
  );

  const pinnedTaskIds = useMemo(
    () => new Set(priorities.map((p) => p.taskId).filter((id): id is string => Boolean(id))),
    [priorities],
  );

  const candidates = useMemo(
    () =>
      optimisticTasks
        .filter((t) => (t.status === "todo" || t.status === "in_progress") && !pinnedTaskIds.has(t.id))
        .sort((a, b) => {
          const da = taskEffectiveDate(a) ?? "9999-99-99";
          const db = taskEffectiveDate(b) ?? "9999-99-99";
          return da < db ? -1 : da > db ? 1 : 0;
        }),
    [optimisticTasks, pinnedTaskIds],
  );

  const scheduledHabitCount = useMemo(
    () => deriveTodayHabits(habits, habitEntries, today, timeZone).length,
    [habits, habitEntries, today, timeZone],
  );

  // Today's opinion, from the same canonical records the sections below render.
  const signal = useMemo(
    () =>
      deriveDaySignal({
        tasks: optimisticTasks,
        goals,
        priorities,
        habits,
        habitEntries,
        today,
        timeZone,
        hour,
      }),
    [optimisticTasks, goals, priorities, habits, habitEntries, today, timeZone, hour],
  );

  const pinnedCount = data.priorities.filter((p) => p.task).length;
  const dayIsEmpty =
    data.focus === null &&
    data.todayTasks.length === 0 &&
    data.overdueTasks.length === 0 &&
    pinnedCount === 0 &&
    data.activeGoals.length === 0 &&
    scheduledHabitCount === 0;

  function toggle(task: Task) {
    startTransition(async () => {
      if (task.status === "completed") {
        applyOptimistic({ type: "status", id: task.id, status: "todo" });
        const result = await reopenTaskAction(task.id);
        if (!result.ok) toast.error(result.error);
      } else {
        applyOptimistic({ type: "status", id: task.id, status: "completed" });
        const result = await completeTaskAction(task.id);
        if (result.ok) {
          // A goal reaching 100% is the rarer, bigger event: let it own the
          // moment instead of stacking a toast on top of a celebration.
          if (result.goalCompleted) {
            setMilestone({ kind: "goal", title: result.goalCompleted.title });
          } else {
            toast.success(`Completed "${task.title}"`);
          }
        } else {
          toast.error(result.error);
        }
      }
    });
  }

  function addPriority(taskId: string) {
    startTransition(async () => {
      const result = await addDailyPriorityAction(taskId);
      if (result.ok) toast.success("Pinned to today's priorities");
      else toast.error(result.error);
    });
  }

  function removePriority(priorityId: string) {
    startTransition(async () => {
      const result = await removeDailyPriorityAction(priorityId);
      if (!result.ok) toast.error(result.error);
    });
  }

  const taskMenu: DropdownItem[] = [
    { label: "View all to-dos", icon: ListChecks, onSelect: () => router.push("/tasks") },
    { label: "New task with details", icon: CalendarClock, onSelect: () => router.push("/tasks?new=1") },
    { type: "separator" },
    { label: "Start a focus session", icon: Play, onSelect: () => router.push("/focus") },
  ];

  const detailTask = detailId ? optimisticTasks.find((t) => t.id === detailId) ?? null : null;
  const detailSubtasks = useMemo(
    () => (detailId ? subtasks.filter((s) => s.parentTaskId === detailId) : []),
    [subtasks, detailId],
  );

  const detailHandlers = {
    onSave: (id: string, values: TaskFormInput) => updateTaskAction(id, values),
    onToggleComplete: toggle,
    onAddSubtask: (parentId: string, title: string) => createSubtaskAction(parentId, title),
    onToggleSubtask: (subtask: Task) =>
      startTransition(async () => {
        const result =
          subtask.status === "completed"
            ? await reopenTaskAction(subtask.id)
            : await completeTaskAction(subtask.id);
        if (!result.ok) toast.error(result.error);
      }),
    onDeleteSubtask: (subtask: Task) =>
      startTransition(async () => {
        const result = await deleteTaskAction(subtask.id);
        if (!result.ok) toast.error(result.error);
      }),
    onDelete: (task: Task) =>
      startTransition(async () => {
        const result = await deleteTaskAction(task.id);
        if (result.ok) toast.success(`Deleted "${task.title}"`);
        else toast.error(result.error);
      }),
  };

  return (
    /* Page sections are 32 apart; groups within a section are 24 apart. */
    <div className="flex flex-col gap-6">
      {/* Greeting */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title-2 text-label">
            Good {greetingPart}, {userName}
          </h1>
          <p className="mt-1 text-subhead tabular-nums text-label-secondary">{dateLabel}</p>
        </div>
        {/* A one-line read on the day, so the header carries information
            instead of whitespace. */}
        {!dayIsEmpty ? (
          <p className="text-subhead text-label-secondary">
            <span className="font-mono tabular-nums text-label">{data.completedToday}</span>
            <span className="text-label-tertiary">/{data.totalToday}</span> done today
            {data.overdueTasks.length > 0 ? (
              <>
                {" · "}
                <span className="font-mono tabular-nums text-red">{data.overdueTasks.length}</span>{" "}
                <span className="text-red">overdue</span>
              </>
            ) : null}
          </p>
        ) : null}
      </header>

      {dayIsEmpty ? (
        <div className="flex flex-col gap-4">
          <EmptyDay />
          <QuickAddTask today={today} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            {/* Main column */}
            <div className="flex flex-col gap-4 md:col-span-8">
              <BrainCard
                signal={signal}
                canPlan={pinnedCount < 3}
                onOpenTask={(task) => setDetailId(task.id)}
              />

              <TopPriorities
                priorities={data.priorities}
                candidates={candidates}
                onToggle={toggle}
                onOpen={(t) => setDetailId(t.id)}
                onAdd={addPriority}
                onRemove={removePriority}
              />

              <Card>
                <CardHeader>
                  <CardTitle>Today&apos;s Tasks</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-footnote tabular-nums text-label-secondary">
                      {data.todayTasks.length}
                    </span>
                    <Dropdown
                      align="end"
                      menuLabel="Today's tasks options"
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="Today's tasks options">
                          <MoreHorizontal />
                        </Button>
                      }
                      items={taskMenu}
                    />
                  </div>
                </CardHeader>
                <CardContent className="px-1 pb-2">
                  {data.todayTasks.length === 0 ? (
                    <p className="mx-3 mb-3 rounded-xl bg-surface-secondary px-4 py-6 text-center text-callout text-label-secondary">
                      Nothing scheduled for today yet.
                    </p>
                  ) : (
                    <div className="flex flex-col">
                      <AnimatePresence initial={false}>
                        {data.todayTasks.map((task, index) => (
                          <motion.div
                            key={task.id}
                            layout
                            variants={listEntrance}
                            initial="hidden"
                            animate="visible"
                            custom={index}
                            exit={rowExit}
                            className="overflow-hidden"
                          >
                            <TaskChecklistItem
                              task={task}
                              onToggle={toggle}
                              onOpen={(t) => setDetailId(t.id)}
                              meta={
                                <span className="flex items-center gap-2">
                                  {task.dueAt ? (
                                    <span className="hidden items-center gap-1 font-mono text-footnote tabular-nums text-label-secondary sm:inline-flex">
                                      <CalendarClock className="size-3.5" aria-hidden />
                                      {formatZonedDateTimeMedium(task.dueAt, timeZone)}
                                    </span>
                                  ) : null}
                                  <PriorityChip task={task} />
                                </span>
                              }
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Add tasks where they appear, not in a distant footer. */}
                  <div className="px-2 pt-2">
                    <QuickAddTask today={today} />
                  </div>
                </CardContent>
              </Card>

              {data.overdueTasks.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TriangleAlert className="size-4 text-red" aria-hidden />
                      Overdue
                      <span className="rounded-full bg-red/12 px-1.5 py-0.5 font-mono text-footnote tabular-nums text-red">
                        {data.overdueTasks.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-1 pb-2">
                    <div className="flex flex-col">
                      <AnimatePresence initial={false}>
                        {data.overdueTasks.map((task, index) => (
                          <motion.div
                            key={task.id}
                            layout
                            variants={listEntrance}
                            initial="hidden"
                            animate="visible"
                            custom={index}
                            exit={rowExit}
                            className="overflow-hidden"
                          >
                            <TaskChecklistItem
                              task={task}
                              onToggle={toggle}
                              onOpen={(t) => setDetailId(t.id)}
                              meta={
                                <span className="flex items-center gap-2">
                                  <span className="font-mono text-footnote tabular-nums text-red">
                                    {formatIsoDateMedium(taskEffectiveDate(task))}
                                  </span>
                                  <PriorityChip task={task} />
                                </span>
                              }
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            {/* Secondary column */}
            <div className="flex flex-col gap-4 md:col-span-4">
              <Card>
                <CardContent className="flex items-center gap-4 pt-4">
                  <ProgressRing
                    percent={data.completionPercent}
                    label={`${data.completedToday} of ${data.totalToday} of today's tasks complete`}
                  />
                  <div className="min-w-0">
                    <h3 className="text-headline text-label">Today&apos;s Progress</h3>
                    <p className="mt-1 font-mono text-footnote tabular-nums text-label-secondary">
                      {data.totalToday === 0
                        ? "No tasks scheduled today."
                        : `${data.completedToday} of ${data.totalToday} tasks done`}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <MomentumCard data={momentum} />

              <ActiveGoalsCard goals={data.activeGoals} />

              <TodayHabits
                habits={habits}
                entries={habitEntries}
                allEntries={allHabitEntries}
                lifeAreas={lifeAreas}
                today={today}
                timeZone={timeZone}
                weekStartsOn={weekStartsOn}
                onMilestone={setMilestone}
              />
            </div>
          </div>

        </>
      )}

      {/* Opening a task from Today shows the SAME panel as To-dos, editing the
          same record. One task, one detail surface. */}
      <TaskDetailPanel
        task={detailTask}
        subtasks={detailSubtasks}
        goals={goals}
        lifeAreas={lifeAreas}
        timeZone={timeZone}
        onClose={() => setDetailId(null)}
        handlers={detailHandlers}
      />

      <Celebration milestone={milestone} onDone={() => setMilestone(null)} />
    </div>
  );
}

/* The old passive FocusCard lived here. It stated "No focus set" while overdue
   work sat directly below it, so it was replaced by BrainCard, which forms an
   opinion from the same data instead of asking the user to. */

/** Real empty state: 28px icon at stroke 1.5, one clear next step. */
function EmptyDay() {
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-secondary text-blue">
        <Sparkles className="size-7" aria-hidden />
      </div>
      <h2 className="mt-5 text-title-3 text-label">A clean slate</h2>
      <p className="mt-2 max-w-md text-body text-label-secondary">
        Nothing is scheduled yet. What is the one thing that would make today count? Add it below, or
        set a goal to work toward.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link href="/tasks" className={buttonVariants({ size: "default" })}>
          <ListChecks className="size-4" aria-hidden />
          Plan a task
        </Link>
        <Link href="/goals" className={buttonVariants({ variant: "secondary", size: "default" })}>
          Set a goal
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}
