"use client";

import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  Check,
  Clock,
  Hourglass,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  acceptSuggestionAction,
  addPlanToTodayAction,
  removePlanItemAction,
  savePlanAction,
  seedPlanAction,
} from "@/app/(app)/planner/actions";
import { LifeAreaIcon } from "@/components/life-areas/icon";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import type { DayPlanAllocation, DayPlanItem, LifeArea, Task } from "@/db";
import type { GoalStatus } from "@/db/schema/enums";
import type { Weekday } from "@/lib/date";
import { lifeAreaColorConfig, resolveColorKey } from "@/lib/life-areas";
import { listContainer, listItem, spring } from "@/lib/motion";
import {
  ALLOCATION_STEP_MINUTES,
  MINUTES_IN_DAY,
  capacitySummary,
  categoryLoad,
  dayCapacity,
  formatDuration,
  isActionable,
  SUGGESTION_REASON_LABEL,
  suggestionsFor,
  type Allocation,
  type PlannerCandidate,
  type Suggestion,
} from "@/lib/planner";
import { TASK_ESTIMATE_OPTIONS, formatEstimate } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type GoalRef = { id: string; title: string; status: GoalStatus; lifeAreaId: string | null };

/**
 * The Day Planner.
 *
 * Three questions, top to bottom: how are my 24 hours divided, what work fits
 * in the parts that hold work, and do I commit it. The whole screen is one
 * arithmetic statement, so the total sits at the top and never scrolls out of
 * the reader's mind.
 *
 * It is NOT a calendar and does not become one at any width. No hour grid, no
 * start times, no drag-to-a-slot: those all demand an answer ("when exactly?")
 * that the person planning their morning does not have and does not need.
 */
export function PlannerView({
  planDate,
  today,
  tomorrow,
  dateLabel,
  allocations,
  items,
  lifeAreas,
  tasks,
  goals,
}: {
  planDate: string;
  today: string;
  tomorrow: string;
  dateLabel: string;
  allocations: DayPlanAllocation[];
  items: DayPlanItem[];
  lifeAreas: LifeArea[];
  tasks: Task[];
  goals: GoalRef[];
  timeZone?: string;
  weekStartsOn?: Weekday;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingCategories, setEditingCategories] = useState(false);
  const [estimateFor, setEstimateFor] = useState<{
    allocationId: string;
    suggestion: Suggestion;
  } | null>(null);

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const lifeAreaById = useMemo(() => new Map(lifeAreas.map((a) => [a.id, a])), [lifeAreas]);

  const activeGoalIds = useMemo(
    () => new Set(goals.filter((goal) => goal.status === "active").map((goal) => goal.id)),
    [goals],
  );
  const goalLifeArea = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal.lifeAreaId])),
    [goals],
  );

  /** The to-dos the planner may draw on: real, open, top-level work. */
  const candidates: PlannerCandidate[] = useMemo(
    () =>
      tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        lifeAreaId: task.lifeAreaId,
        goalId: task.goalId,
        scheduledFor: task.scheduledFor,
        dueDate: task.dueAt ? task.dueAt.toISOString().slice(0, 10) : null,
        estimateMinutes: task.estimateMinutes,
        sortOrder: task.sortOrder,
        createdAt: task.createdAt,
      })),
    [tasks],
  );

  const acceptedTaskIds = useMemo(() => new Set(items.map((item) => item.taskId)), [items]);
  const itemsByAllocation = useMemo(() => {
    const map = new Map<string, DayPlanItem[]>();
    for (const item of items) {
      const list = map.get(item.allocationId);
      if (list) list.push(item);
      else map.set(item.allocationId, [item]);
    }
    return map;
  }, [items]);

  const capacity = dayCapacity(allocations);
  const plannedTotal = items.reduce((sum, item) => sum + item.plannedMinutes, 0);

  /*
   * A life area can back at most ONE category in a plan.
   *
   * The database says so (`day_plan_allocations_life_area_uq`), and it is the
   * right rule: two bars drawing on the same area would suggest the same work
   * twice and double-count the day. So the link control must not offer an area
   * that is already taken, or the user picks it and gets a failed save with
   * nothing explaining why. Found exactly that way: yesterday's plan is copied
   * forward, so today already contained the Career category the user was then
   * offered again.
   */
  const linkedAreaIds = new Set(
    allocations.map((a) => a.lifeAreaId).filter((id): id is string => Boolean(id)),
  );
  const linkableAreas = lifeAreas.filter((area) => !linkedAreaIds.has(area.id));

  function seed() {
    startTransition(async () => {
      const result = await seedPlanAction(planDate);
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  function accept(allocationId: string, suggestion: Suggestion, minutes: number) {
    startTransition(async () => {
      const result = await acceptSuggestionAction({
        planDate,
        allocationId,
        taskId: suggestion.task.id,
        plannedMinutes: minutes,
      });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(`Added "${suggestion.task.title}"`);
        router.refresh();
      }
    });
  }

  function remove(item: DayPlanItem, title: string) {
    startTransition(async () => {
      const result = await removePlanItemAction(item.id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(`Removed "${title}" from the plan`);
        router.refresh();
      }
    });
  }

  /**
   * Point a planner-only category at an existing life area.
   *
   * Reuses `savePlanAction`, the SAME path the category editor uses, rather
   * than adding a second way to write an allocation. `syncAllocations` updates
   * rows in place by id, so the category keeps its id and the to-dos already
   * accepted into it are untouched.
   *
   * The kind changes with the link because the database insists: the check
   * constraint `day_plan_allocations_kind_matches_link` forbids a `planner` row
   * from carrying a life_area_id. The LABEL is deliberately kept, so a category
   * the user called "Work" stays called "Work" and simply starts drawing on
   * that area's work.
   */
  function linkLifeArea(allocationId: string, lifeAreaId: string) {
    startTransition(async () => {
      const result = await savePlanAction({
        planDate,
        allocations: allocations.map((a) =>
          a.id === allocationId
            ? { id: a.id, kind: "life_area" as const, lifeAreaId, label: a.label, minutes: a.minutes }
            : {
                id: a.id,
                kind: a.kind,
                lifeAreaId: a.lifeAreaId ?? "",
                label: a.label,
                minutes: a.minutes,
              },
        ),
      });
      if (!result.ok) toast.error(result.error);
      else {
        const area = lifeAreas.find((a) => a.id === lifeAreaId);
        toast.success(`Linked to ${area?.name ?? "that life area"}`);
        router.refresh();
      }
    });
  }

  function commit() {
    startTransition(async () => {
      const result = await addPlanToTodayAction(planDate);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { scheduled, alreadyThere } = result.data;
      toast.success(
        scheduled > 0
          ? `${scheduled} to-do${scheduled === 1 ? "" : "s"} added to ${planDate === today ? "today" : "tomorrow"}`
          : `Everything in this plan was already on ${planDate === today ? "today" : "tomorrow"}`,
        alreadyThere > 0 && scheduled > 0
          ? { description: `${alreadyThere} was already there.` }
          : undefined,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Day Planner"
        description="You have 24 hours. Decide where they go, then choose what fits."
        action={
          <div className="flex items-center gap-2">
            <DayToggle
              current={planDate}
              today={today}
              tomorrow={tomorrow}
              disabled={pending}
            />
          </div>
        }
      />

      {allocations.length === 0 ? (
        <EmptyPlanner dateLabel={dateLabel} onSeed={seed} pending={pending} />
      ) : (
        <>
          <CapacityBar
            allocations={allocations}
            lifeAreaById={lifeAreaById}
            onEdit={() => setEditingCategories(true)}
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {allocations.map((allocation) => {
              const asAllocation: Allocation = {
                id: allocation.id,
                kind: allocation.kind,
                lifeAreaId: allocation.lifeAreaId,
                label: allocation.label,
                minutes: allocation.minutes,
                sortOrder: allocation.sortOrder,
              };
              const allocItems = itemsByAllocation.get(allocation.id) ?? [];
              const load = categoryLoad(asAllocation, allocItems);
              const suggestions = suggestionsFor({
                allocation: asAllocation,
                candidates,
                acceptedTaskIds,
                activeGoalIds,
                goalLifeArea,
                today: planDate,
              });

              return (
                <CategoryCard
                  key={allocation.id}
                  allocation={asAllocation}
                  area={
                    allocation.lifeAreaId ? (lifeAreaById.get(allocation.lifeAreaId) ?? null) : null
                  }
                  load={load}
                  items={allocItems}
                  taskById={taskById}
                  suggestions={suggestions}
                  linkableAreas={linkableAreas}
                  hasLifeAreas={lifeAreas.length > 0}
                  pending={pending}
                  onAccept={(suggestion) => {
                    if (suggestion.minutes === null) {
                      // GoHa will not invent a duration. Ask, then accept.
                      setEstimateFor({ allocationId: allocation.id, suggestion });
                      return;
                    }
                    accept(allocation.id, suggestion, suggestion.minutes);
                  }}
                  onRemove={remove}
                  onLink={linkLifeArea}
                />
              );
            })}
          </div>

          <CommitBar
            planDate={planDate}
            today={today}
            itemCount={items.length}
            plannedTotal={plannedTotal}
            capacity={capacity}
            pending={pending}
            onCommit={commit}
          />
        </>
      )}

      <CategoryEditor
        open={editingCategories}
        planDate={planDate}
        allocations={allocations}
        lifeAreas={lifeAreas}
        onClose={() => setEditingCategories(false)}
        onSaved={() => {
          setEditingCategories(false);
          router.refresh();
        }}
      />

      <EstimatePrompt
        suggestion={estimateFor?.suggestion ?? null}
        onClose={() => setEstimateFor(null)}
        onConfirm={(minutes) => {
          if (!estimateFor) return;
          accept(estimateFor.allocationId, estimateFor.suggestion, minutes);
          setEstimateFor(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DayToggle({
  current,
  today,
  tomorrow,
  disabled,
}: {
  current: string;
  today: string;
  tomorrow: string;
  disabled?: boolean;
}) {
  const options = [
    { label: "Today", value: today },
    { label: "Tomorrow", value: tomorrow },
  ];
  return (
    <div
      className="inline-flex rounded-lg bg-fill-tertiary p-0.5"
      role="group"
      aria-label="Which day to plan"
    >
      {options.map((option) => (
        <Link
          key={option.value}
          href={option.value === today ? "/planner" : `/planner?date=${option.value}`}
          aria-current={current === option.value ? "page" : undefined}
          aria-disabled={disabled}
          className={cn(
            "touch-target rounded-md px-3 text-callout font-medium transition-colors",
            current === option.value
              ? "bg-surface text-label shadow-e1"
              : "text-label-secondary hover:text-label",
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

function EmptyPlanner({
  dateLabel,
  onSeed,
  pending,
}: {
  dateLabel: string;
  onSeed: () => void;
  pending: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center py-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-surface-secondary text-blue">
          <Hourglass className="size-7" aria-hidden />
        </div>
        <h2 className="mt-5 text-title-3 text-label">Shape {dateLabel}</h2>
        <p className="mt-2 max-w-md text-body text-label-secondary">
          Split the day into the parts it actually has, like sleep, work and time for yourself.
          Then GoHa can show you what fits in the parts that hold real work.
        </p>
        <Button className="mt-6" onClick={onSeed} loading={pending} disabled={pending}>
          <Sparkles aria-hidden />
          Start with a typical day
        </Button>
        <p className="mt-3 max-w-sm text-footnote text-label-tertiary">
          You can change every category and every hour afterwards. Nothing is added to your day
          until you say so.
        </p>
      </CardContent>
    </Card>
  );
}

/** The 24-hour bar: one stacked strip, then the numbers under it. */
function CapacityBar({
  allocations,
  lifeAreaById,
  onEdit,
}: {
  allocations: DayPlanAllocation[];
  lifeAreaById: Map<string, LifeArea>;
  onEdit: () => void;
}) {
  const capacity = dayCapacity(allocations);
  // Over capacity, the strip is scaled by what was allocated rather than by 24
  // hours, so every category stays visible and the overflow is stated in words
  // instead of being drawn as a bar running off the edge.
  const scale = Math.max(MINUTES_IN_DAY, capacity.allocatedMinutes);

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-subhead text-label-secondary">Your 24 hours</p>
            <p
              className={cn(
                "mt-0.5 text-footnote",
                capacity.status === "over" ? "text-orange" : "text-label-tertiary",
              )}
            >
              {capacitySummary(capacity)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-title-3 tabular-nums text-label">
              {formatDuration(capacity.allocatedMinutes)}
              <span className="text-label-tertiary"> / 24h</span>
            </span>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Edit categories
            </Button>
          </div>
        </div>

        <div
          className="flex h-4 w-full overflow-hidden rounded-full bg-fill-tertiary"
          role="img"
          aria-label={`${formatDuration(capacity.allocatedMinutes)} of 24 hours allocated`}
        >
          {allocations.map((allocation) => {
            const area = allocation.lifeAreaId
              ? (lifeAreaById.get(allocation.lifeAreaId) ?? null)
              : null;
            const color = area
              ? lifeAreaColorConfig[resolveColorKey(area.color, area.id)].dot
              : "bg-gray-3";
            return (
              <motion.span
                key={allocation.id}
                className={cn("h-full border-r border-surface last:border-r-0", color)}
                initial={{ width: 0 }}
                animate={{ width: `${(allocation.minutes / scale) * 100}%` }}
                transition={spring.smooth}
                title={`${allocation.label}: ${formatDuration(allocation.minutes)}`}
              />
            );
          })}
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {allocations.map((allocation) => {
            const area = allocation.lifeAreaId
              ? (lifeAreaById.get(allocation.lifeAreaId) ?? null)
              : null;
            const color = area
              ? lifeAreaColorConfig[resolveColorKey(area.color, area.id)].dot
              : "bg-gray-3";
            return (
              <li
                key={allocation.id}
                className="flex items-center gap-1.5 text-footnote text-label-secondary"
              >
                <span className={cn("size-2 shrink-0 rounded-full", color)} aria-hidden />
                {allocation.label}
                <span className="font-mono tabular-nums text-label-tertiary">
                  {formatDuration(allocation.minutes)}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function CategoryCard({
  allocation,
  area,
  load,
  items,
  taskById,
  suggestions,
  linkableAreas,
  hasLifeAreas,
  pending,
  onAccept,
  onRemove,
  onLink,
}: {
  allocation: Allocation;
  area: LifeArea | null;
  load: ReturnType<typeof categoryLoad>;
  items: DayPlanItem[];
  taskById: Map<string, Task>;
  suggestions: Suggestion[];
  /** Life areas not already backing another category in this plan. */
  linkableAreas: LifeArea[];
  /** Whether the user has any life areas at all, linked or not. */
  hasLifeAreas: boolean;
  pending: boolean;
  onAccept: (suggestion: Suggestion) => void;
  onRemove: (item: DayPlanItem, title: string) => void;
  onLink: (allocationId: string, lifeAreaId: string) => void;
}) {
  const actionable = isActionable(allocation);
  /*
   * Actionable, but with nothing to match against.
   *
   * Sleep and Meals are NOT this: they are non-actionable and keep their
   * "time reserved" note, with no suggestions and nothing to link.
   */
  const unlinked = actionable && allocation.kind === "planner";
  const color = area ? lifeAreaColorConfig[resolveColorKey(area.color, area.id)] : null;

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col py-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="flex min-w-0 items-center gap-2 text-headline text-label">
            {area ? (
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md",
                  color?.tile,
                )}
              >
                <LifeAreaIcon iconKey={area.icon} className="size-3.5" />
              </span>
            ) : (
              <span className={cn("size-2 shrink-0 rounded-full", "bg-gray-3")} aria-hidden />
            )}
            <span className="truncate">{allocation.label}</span>
          </h3>
          <span className="shrink-0 font-mono text-callout tabular-nums text-label-secondary">
            {formatDuration(allocation.minutes)}
          </span>
        </div>

        {!actionable ? (
          /* Sleep is not a category you get behind on. Reserving the hours is
             the whole contribution; offering to fill them would be nonsense. */
          <p className="mt-3 rounded-xl bg-fill-quaternary px-3 py-2.5 text-callout text-label-tertiary">
            Time reserved. Nothing to plan here.
          </p>
        ) : (
          <>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-footnote">
                <span className="text-label-secondary">
                  {formatDuration(load.plannedMinutes)} planned
                </span>
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    load.overMinutes > 0 ? "text-orange" : "text-label-tertiary",
                  )}
                >
                  {load.overMinutes > 0
                    ? `${formatDuration(load.overMinutes)} over`
                    : `${formatDuration(load.freeMinutes)} free`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill-tertiary">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-300",
                    load.overMinutes > 0 ? "bg-orange" : color ? color.dot : "bg-blue",
                  )}
                  style={{
                    width: `${Math.min(100, (load.plannedMinutes / Math.max(1, load.capacityMinutes)) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {items.length > 0 ? (
              <motion.ul
                variants={listContainer}
                initial="hidden"
                animate="visible"
                className="mt-3 flex flex-col gap-1.5"
              >
                {items.map((item) => {
                  const task = taskById.get(item.taskId);
                  return (
                    <motion.li
                      key={item.id}
                      variants={listItem}
                      className="flex items-center gap-2 rounded-xl bg-fill-quaternary px-2.5 py-2"
                    >
                      <Check className="size-3.5 shrink-0 text-green" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-callout text-label">
                        {task?.title ?? "A to-do that has since been removed"}
                      </span>
                      <span className="shrink-0 font-mono text-footnote tabular-nums text-label-secondary">
                        {formatDuration(item.plannedMinutes)}
                      </span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onRemove(item, task?.title ?? "that to-do")}
                        aria-label={`Remove ${task?.title ?? "this item"} from the plan`}
                        className="hit-44 hit-44-narrow flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-label-tertiary transition-colors hover:text-red focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </motion.li>
                  );
                })}
              </motion.ul>
            ) : null}

            <div className="mt-3 flex-1">
              <p className="mb-1.5 text-footnote font-medium uppercase tracking-wide text-label-tertiary">
                Suggested
              </p>
              {suggestions.length === 0 && unlinked ? (
                /*
                 * Say WHY it is empty, and offer the one-click cure.
                 *
                 * A planner-only category matches to-dos that no life area
                 * claims. That rule is right, but the starter day ships with
                 * "Work", and most real work IS under a life area, so this card
                 * read "No open to-dos belong to this category yet" on a day
                 * that was full of exactly the work the user meant by it. The
                 * message was true and sounded like a bug.
                 *
                 * Linking promotes the row to a life-area category. The DB check
                 * `day_plan_allocations_kind_matches_link` forbids a `planner`
                 * row from holding a life_area_id, so the kind has to change
                 * with it; the LABEL is kept, so the category the user named
                 * stays named that.
                 */
                <div className="rounded-xl bg-fill-quaternary px-3 py-2.5">
                  <p className="text-callout text-label-tertiary">
                    No life area is linked to {allocation.label} yet, so GoHa has nothing to suggest
                    here.
                  </p>
                  {linkableAreas.length > 0 ? (
                    <div className="mt-2">
                      <Select
                        aria-label={`Link a life area to ${allocation.label}`}
                        value=""
                        disabled={pending}
                        onChange={(value) => value && onLink(allocation.id, value)}
                        options={[
                          { value: "", label: "Link a life area" },
                          ...linkableAreas.map((area) => ({ value: area.id, label: area.name })),
                        ]}
                      />
                      <p className="mt-1 text-footnote text-label-quaternary">
                        Keeps the name {allocation.label}, and starts suggesting that area&apos;s
                        work.
                      </p>
                    </div>
                  ) : hasLifeAreas ? (
                    /* Every area already backs another category in this plan. */
                    <p className="mt-1 text-footnote text-label-quaternary">
                      Every life area already has its own category today.
                    </p>
                  ) : (
                    /* No life areas yet. Point at them; never force one. */
                    <p className="mt-1 text-footnote text-label-quaternary">
                      Create a life area and its work can appear here.
                    </p>
                  )}
                </div>
              ) : suggestions.length === 0 ? (
                <p className="rounded-xl bg-fill-quaternary px-3 py-2.5 text-callout text-label-tertiary">
                  {items.length > 0
                    ? "Nothing else open for this category."
                    : "No open to-dos belong to this category yet."}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {suggestions.slice(0, 4).map((suggestion) => (
                    <li key={suggestion.task.id}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onAccept(suggestion)}
                        className="group flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-separator-opaque px-2.5 py-2 text-left transition-colors hover:border-blue/40 hover:bg-surface-hover focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Plus
                          className="size-3.5 shrink-0 text-label-tertiary transition-colors group-hover:text-blue"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-callout text-label">
                            {suggestion.task.title}
                          </span>
                          {suggestion.reasons.length > 0 ? (
                            <span className="mt-0.5 flex flex-wrap gap-1.5">
                              {suggestion.reasons.slice(0, 2).map((reason) => (
                                <span
                                  key={reason}
                                  className={cn(
                                    "rounded-sm px-1 py-0.5 text-footnote",
                                    reason === "overdue"
                                      ? "bg-red/15 text-red"
                                      : "bg-fill-tertiary text-label-tertiary",
                                  )}
                                >
                                  {SUGGESTION_REASON_LABEL[reason]}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-mono text-footnote tabular-nums",
                            suggestion.minutes === null
                              ? "text-label-quaternary"
                              : "text-label-secondary",
                          )}
                        >
                          {/* Never a guessed number. An unestimated to-do says
                              so, and accepting it asks how long it takes. */}
                          {suggestion.minutes === null
                            ? "?"
                            : formatDuration(suggestion.minutes)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CommitBar({
  planDate,
  today,
  itemCount,
  plannedTotal,
  capacity,
  pending,
  onCommit,
}: {
  planDate: string;
  today: string;
  itemCount: number;
  plannedTotal: number;
  capacity: ReturnType<typeof dayCapacity>;
  pending: boolean;
  onCommit: () => void;
}) {
  const dayWord = planDate === today ? "Today" : "Tomorrow";
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-subhead text-label">
            {itemCount === 0
              ? "Nothing chosen yet"
              : `${itemCount} to-do${itemCount === 1 ? "" : "s"}, ${formatDuration(plannedTotal)} of work`}
          </p>
          <p className="mt-0.5 text-footnote text-label-tertiary">
            {itemCount === 0
              ? "Pick from the suggestions above. Nothing moves until you add it."
              : `Adds these to ${dayWord.toLowerCase()} so they appear on your dashboard.`}
          </p>
          {capacity.status === "over" ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-footnote text-orange">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              Your categories add up to more than a day. Worth a second look before you commit.
            </p>
          ) : null}
        </div>
        <Button onClick={onCommit} loading={pending} disabled={pending || itemCount === 0}>
          <CalendarCheck aria-hidden />
          Add to {dayWord}
          <ArrowRight aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

type DraftAllocation = {
  id?: string;
  kind: "life_area" | "planner";
  lifeAreaId: string | null;
  label: string;
  minutes: number;
};

/**
 * Editing the day's shape.
 *
 * A modal rather than inline editing, because changing the split is a distinct
 * act from choosing work, and doing both on one surface made the capacity
 * number move for two unrelated reasons. The running total updates live here,
 * so the consequence of every change is visible before it is saved.
 */
function CategoryEditor({
  open,
  planDate,
  allocations,
  lifeAreas,
  onClose,
  onSaved,
}: {
  open: boolean;
  planDate: string;
  allocations: DayPlanAllocation[];
  lifeAreas: LifeArea[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your day's categories"
      description="Split 24 hours into the parts your day actually has."
      className="sm:max-w-2xl"
    >
      {open ? (
        <CategoryEditorBody
          planDate={planDate}
          allocations={allocations}
          lifeAreas={lifeAreas}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Modal>
  );
}

function CategoryEditorBody({
  planDate,
  allocations,
  lifeAreas,
  onClose,
  onSaved,
}: {
  planDate: string;
  allocations: DayPlanAllocation[];
  lifeAreas: LifeArea[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<DraftAllocation[]>(() =>
    allocations.map((a) => ({
      id: a.id,
      kind: a.kind,
      lifeAreaId: a.lifeAreaId,
      label: a.label,
      minutes: a.minutes,
    })),
  );
  const [newLabel, setNewLabel] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const capacity = dayCapacity(draft);
  const usedAreaIds = new Set(draft.map((d) => d.lifeAreaId).filter(Boolean));

  function setMinutes(index: number, minutes: number) {
    setDraft((rows) =>
      rows.map((row, i) =>
        i === index
          ? { ...row, minutes: Math.max(15, Math.min(MINUTES_IN_DAY, minutes)) }
          : row,
      ),
    );
  }

  function addPlannerCategory() {
    const label = newLabel.trim();
    if (!label) return;
    if (draft.some((row) => row.label.toLowerCase() === label.toLowerCase())) {
      setError(`You already have a category called "${label}".`);
      return;
    }
    setError(null);
    setDraft((rows) => [
      ...rows,
      { kind: "planner", lifeAreaId: null, label, minutes: 60 },
    ]);
    setNewLabel("");
  }

  function addLifeAreaCategory(areaId: string) {
    const area = lifeAreas.find((a) => a.id === areaId);
    if (!area) return;
    if (draft.some((row) => row.label.toLowerCase() === area.name.toLowerCase())) {
      setError(`You already have a category called "${area.name}".`);
      return;
    }
    setError(null);
    setDraft((rows) => [
      ...rows,
      { kind: "life_area", lifeAreaId: area.id, label: area.name, minutes: 60 },
    ]);
    setNewAreaId("");
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await savePlanAction({
      planDate,
      allocations: draft.map((row) => ({
        id: row.id,
        kind: row.kind,
        lifeAreaId: row.lifeAreaId ?? "",
        label: row.label,
        minutes: row.minutes,
      })),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success("Categories saved");
    onSaved();
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-callout text-red"
        >
          {error}
        </p>
      ) : null}

      <div
        className={cn(
          "flex items-center justify-between rounded-xl px-3 py-2.5",
          capacity.status === "over" ? "bg-orange/10" : "bg-fill-quaternary",
        )}
        role="status"
      >
        <span className="text-callout text-label">{capacitySummary(capacity)}</span>
        <span
          className={cn(
            "font-mono text-callout tabular-nums",
            capacity.status === "over" ? "text-orange" : "text-label-secondary",
          )}
        >
          {formatDuration(capacity.allocatedMinutes)} / 24h
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {draft.map((row, index) => (
          <li
            key={row.id ?? `${row.label}-${index}`}
            className="flex items-center gap-2 rounded-xl border border-separator-opaque px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-body text-label">{row.label}</span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setMinutes(index, row.minutes - ALLOCATION_STEP_MINUTES)}
                aria-label={`Less time for ${row.label}`}
                disabled={row.minutes <= 15}
                className="hit-44 flex size-8 cursor-pointer items-center justify-center rounded-lg bg-fill-tertiary text-label transition-colors hover:bg-fill-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus className="size-3.5" aria-hidden />
              </button>
              <span className="w-16 text-center font-mono text-callout tabular-nums text-label">
                {formatDuration(row.minutes)}
              </span>
              <button
                type="button"
                onClick={() => setMinutes(index, row.minutes + ALLOCATION_STEP_MINUTES)}
                aria-label={`More time for ${row.label}`}
                className="hit-44 flex size-8 cursor-pointer items-center justify-center rounded-lg bg-fill-tertiary text-label transition-colors hover:bg-fill-secondary"
              >
                <Plus className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setDraft((rows) => rows.filter((_, i) => i !== index))}
                aria-label={`Remove ${row.label}`}
                className="hit-44 ml-1 flex size-8 cursor-pointer items-center justify-center rounded-lg text-label-tertiary transition-colors hover:text-red"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 border-t border-separator pt-4">
        <div>
          <label htmlFor="planner-new-label" className="mb-1.5 block text-subhead text-label-secondary">
            Add a category
          </label>
          <div className="flex gap-2">
            <Input
              id="planner-new-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPlannerCategory();
                }
              }}
              placeholder="Sleep, Commute, Family..."
              maxLength={40}
            />
            <Button type="button" variant="secondary" onClick={addPlannerCategory}>
              Add
            </Button>
          </div>
          <p className="mt-1 text-footnote text-label-tertiary">
            A planner category just reserves time. It does not become a life area.
          </p>
        </div>

        {lifeAreas.length > 0 ? (
          <div>
            <label htmlFor="planner-new-area" className="mb-1.5 block text-subhead text-label-secondary">
              Or use a life area
            </label>
            <Select
              id="planner-new-area"
              value={newAreaId}
              onChange={(value) => {
                setNewAreaId(value);
                if (value) addLifeAreaCategory(value);
              }}
              options={[
                { value: "", label: "Choose a life area" },
                ...lifeAreas
                  .filter((area) => !usedAreaIds.has(area.id))
                  .map((area) => ({ value: area.id, label: area.name })),
              ]}
            />
            <p className="mt-1 text-footnote text-label-tertiary">
              GoHa can suggest real work for these, because your goals live under them.
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-1 flex items-center justify-end gap-3 border-t border-separator pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={save} loading={saving}>
          Save categories
        </Button>
      </div>
    </div>
  );
}

/**
 * Ask how long an unestimated to-do takes, rather than guessing.
 *
 * The single most important rule in this feature, made visible: GoHa does not
 * fabricate a duration, so accepting a to-do nobody has sized stops here and
 * asks. The answer is also written back to the to-do, so the question is asked
 * once rather than every morning.
 */
function EstimatePrompt({
  suggestion,
  onClose,
  onConfirm,
}: {
  suggestion: Suggestion | null;
  onClose: () => void;
  onConfirm: (minutes: number) => void;
}) {
  return (
    <Modal
      open={Boolean(suggestion)}
      onClose={onClose}
      title="How long will this take?"
      description={
        suggestion
          ? `"${suggestion.task.title}" has no estimate yet, so GoHa cannot fit it into your day without one.`
          : undefined
      }
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estimated time">
          {TASK_ESTIMATE_OPTIONS.map((minutes) => (
            <Button
              key={minutes}
              variant="secondary"
              onClick={() => onConfirm(minutes)}
            >
              <Clock aria-hidden />
              {formatEstimate(minutes)}
            </Button>
          ))}
        </div>
        <p className="text-footnote text-label-tertiary">
          This is saved on the to-do as well, so you will not be asked again.
        </p>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
