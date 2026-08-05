"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  CalendarClock,
  ListChecks,
  MoreHorizontal,
  Moon,
  Play,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { completeTaskAction, reopenTaskAction } from "@/app/(app)/tasks/actions";
import { addDailyPriorityAction, removeDailyPriorityAction } from "@/app/(app)/today/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";
import { ProgressRing } from "@/components/ui/progress";
import type { DailyPriority, HabitEntry, Task } from "@/db";
import type { GoalWithCounts } from "@/db/repositories/goals";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import type { TaskStatus } from "@/db/schema/enums";
import { formatIsoDateMedium, formatZonedDateTimeMedium, MANILA_TZ } from "@/lib/date";
import { deriveTodayHabits } from "@/lib/habit-view";
import { listEntrance, rowExit } from "@/lib/motion";
import { taskEffectiveDate } from "@/lib/task-buckets";
import { taskPriorityConfig } from "@/lib/tasks";
import { deriveTodayData } from "@/lib/today";
import { cn } from "@/lib/utils";

import { ActiveGoalsCard } from "./active-goals-card";
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
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

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
    () => deriveTodayHabits(habits, habitEntries, today).length,
    [habits, habitEntries, today],
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
        if (result.ok) toast.success(`Completed "${task.title}"`);
        else toast.error(result.error);
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

  return (
    /* Page sections are 32 apart; groups within a section are 24 apart. */
    <div className="flex flex-col gap-8">
      {/* Greeting */}
      <header>
        <h1 className="text-title-2 text-label">
          Good {greetingPart}, {userName}
        </h1>
        <p className="mt-1 text-subhead tabular-nums text-label-secondary">{dateLabel}</p>
      </header>

      {dayIsEmpty ? (
        <div className="flex flex-col gap-6">
          <EmptyDay />
          <QuickAddTask today={today} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            {/* Main column */}
            <div className="flex flex-col gap-6 md:col-span-8">
              <FocusCard task={data.focus} timeZone={timeZone} onToggle={toggle} />

              <TopPriorities
                priorities={data.priorities}
                candidates={candidates}
                onToggle={toggle}
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
            <div className="flex flex-col gap-6 md:col-span-4">
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

              <ActiveGoalsCard goals={data.activeGoals} />

              <TodayHabits habits={habits} entries={habitEntries} today={today} />
            </div>
          </div>

          {/* Foot */}
          <div className="grid grid-cols-1">
            <Link
              href="/review"
              className="group flex h-12 items-center justify-between rounded-2xl border border-separator-opaque bg-surface px-4 shadow-e1 transition-shadow hover:shadow-e2"
            >
              <span className="flex items-center gap-2">
                <Moon className="size-4 text-indigo" aria-hidden />
                <span className="text-callout font-medium text-label">Evening Reflection</span>
              </span>
              <ArrowRight
                className="size-4 text-label-tertiary transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The day's single anchor. A SOLID card (glass is chrome-only); the blue
 * primary action is the one accent moment on the screen.
 */
function FocusCard({
  task,
  timeZone,
  onToggle,
}: {
  task: Task | null;
  timeZone: string;
  onToggle: (task: Task) => void;
}) {
  const due = task ? formatZonedDateTimeMedium(task.dueAt, timeZone) : null;

  return (
    <Card className="p-4 sm:p-5">
      <p className="flex items-center gap-2 text-caption uppercase text-label-secondary">
        <Play className="size-3.5 text-blue" aria-hidden />
        Today&apos;s Focus
      </p>

      {task ? (
        <>
          <h2 className="mt-3 text-title-3 text-label">{task.title}</h2>
          <p className="mt-1 font-mono text-footnote tabular-nums text-label-secondary">
            {due ? `Due ${due}  ·  ` : ""}
            {taskPriorityConfig[task.priority].label} priority
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link href="/focus" className={buttonVariants({ size: "lg" })}>
              <Play className="size-4" aria-hidden />
              Start Focus Session
            </Link>
            <Button variant="secondary" onClick={() => onToggle(task)}>
              Mark done
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 max-w-md text-body text-label-secondary">
            No focus set. Pin a Top 3 priority or schedule a task for today to give your day a clear
            anchor.
          </p>
          <Link
            href="/tasks"
            className={cn(buttonVariants({ variant: "secondary" }), "mt-5")}
          >
            Choose today&apos;s focus
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </>
      )}
    </Card>
  );
}

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
