"use client";

import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  BookmarkCheck,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Link2,
  Minus,
  Pencil,
  Plus,
  Sparkles,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  acceptSuggestionAction,
  addFreeformItemAction,
  addPlanToTodayAction,
  logActualMinutesAction,
  removePlanItemAction,
  renameFreeformItemAction,
  saveAsDefaultsAction,
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
import {
  resolveAreaColor,
  toIconKey,
} from "@/lib/life-areas";
import { ColorPicker } from "@/components/ui/color-picker";
import { IconPicker } from "@/components/ui/icon-picker";
import { listContainer, listItem, spring } from "@/lib/motion";
import {
  ALLOCATION_STEP_MINUTES,
  MINUTES_IN_DAY,
  capacitySummary,
  categoryLoad,
  dayActuals,
  dayCapacity,
  entryTitle,
  formatDuration,
  SUGGESTION_REASON_LABEL,
  suggestionsFor,
  type Allocation,
  type CategoryActual,
  type PlannerCandidate,
  type Suggestion,
} from "@/lib/planner";
import { TASK_ESTIMATE_OPTIONS, formatEstimate } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type GoalRef = { id: string; title: string; status: GoalStatus; lifeAreaId: string | null };
type FocusActual = { taskId: string | null; seconds: number; sessions: number };

/**
 * The colour a category draws with.
 *
 * Three sources, most deliberate first: a colour the user picked for this
 * category, the colour of the life area behind it, then one derived from the
 * category's own id so an untouched plan is still legible rather than a row of
 * grey bars. Same vocabulary as Life Areas throughout, so "Health" looks like
 * Health wherever it appears.
 *
 * Returns the RESOLVED shape rather than a palette key, because a category may
 * now carry a custom hex that no key can name. `fill` is always a usable CSS
 * colour; `dot`/`tile` are Tailwind classes and are null for a custom one,
 * which is what `swatchStyle` below exists to cover.
 */
function categoryColor(allocation: Pick<Allocation, "id" | "color">, area: LifeArea | null) {
  if (allocation.color) return resolveAreaColor(allocation.color, allocation.id);
  if (area) return resolveAreaColor(area.color, area.id);
  return resolveAreaColor(null, allocation.id);
}

type ResolvedColor = ReturnType<typeof categoryColor>;

/** Class for a preset, inline style for a custom hex. Never a raw CSS string. */
function swatch(resolved: ResolvedColor): { className: string; style?: { backgroundColor: string } } {
  return resolved.dot
    ? { className: resolved.dot }
    : { className: "", style: { backgroundColor: resolved.fill } };
}

/**
 * The Day Planner.
 *
 * A CAPACITY tool, not a calendar: it answers "does what I intend to do fit in
 * the day I have", never "at what o'clock". No hour grid and no start times,
 * because the honest answer to "when will I write the case study" is usually
 * "sometime in the eight hours I call work".
 *
 * The screen reads top to bottom as four plain questions:
 *
 *   1. How are my 24 hours divided?      the day summary
 *   2. What is in each part?             the category cards
 *   3. What actually happened?           planned vs actual, from Focus
 *   4. Do I commit it?                   the bottom bar
 *
 * GoHa decides NONE of it. Categories are the user's, entries are the user's,
 * and a suggestion is a list you may read and ignore. Nothing is placed
 * anywhere without someone pressing something.
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
  focusActuals,
  hasSavedDefaults,
  isToday,
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
  focusActuals: FocusActual[];
  hasSavedDefaults: boolean;
  isToday: boolean;
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
  const taskTitles = useMemo(
    () => new Map(tasks.map((task) => [task.id, task.title])),
    [tasks],
  );
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

  const acceptedTaskIds = useMemo(
    () => new Set(items.map((item) => item.taskId).filter((id): id is string => Boolean(id))),
    [items],
  );
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

  const actuals = useMemo(
    () => dayActuals({ allocations, entries: items, focus: focusActuals }),
    [allocations, items, focusActuals],
  );

  /*
   * Focus minutes per to-do, so a linked entry can show its OWN actual and not
   * just its category's. Derived from the same rows `dayActuals` totals, so the
   * per-entry numbers and the category number can never disagree.
   */
  const focusByTask = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of focusActuals) {
      if (row.taskId) map.set(row.taskId, Math.round(row.seconds / 60));
    }
    return map;
  }, [focusActuals]);

  /*
   * A life area can back at most ONE category in a plan.
   *
   * The database says so (`day_plan_allocations_life_area_uq`), and it is the
   * right rule: two bars drawing on the same area would suggest the same work
   * twice and double-count the day. So the link control must not offer an area
   * that is already taken, or the user picks it and gets a failed save with
   * nothing explaining why.
   */
  const linkedAreaIds = new Set(
    allocations.map((a) => a.lifeAreaId).filter((id): id is string => Boolean(id)),
  );
  const linkableAreas = lifeAreas.filter((area) => !linkedAreaIds.has(area.id));

  const asAllocations: Allocation[] = allocations.map((a) => ({
    id: a.id,
    kind: a.kind,
    lifeAreaId: a.lifeAreaId,
    label: a.label,
    minutes: a.minutes,
    sortOrder: a.sortOrder,
    color: a.color,
    icon: a.icon,
  }));

  function refreshAfter(result: { ok: boolean; error?: string }, success?: string) {
    if (!result.ok) {
      toast.error(result.error ?? "Something went wrong.");
      return false;
    }
    if (success) toast.success(success);
    router.refresh();
    return true;
  }

  function seed() {
    startTransition(async () => {
      const result = await seedPlanAction(planDate);
      refreshAfter(result);
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
      refreshAfter(result, `Added "${suggestion.task.title}"`);
    });
  }

  function addFreeform(allocationId: string, label: string, minutes: number) {
    startTransition(async () => {
      const result = await addFreeformItemAction({
        planDate,
        allocationId,
        label,
        plannedMinutes: minutes,
      });
      refreshAfter(result, `Added "${label}"`);
    });
  }

  function renameFreeform(id: string, label: string) {
    startTransition(async () => {
      const result = await renameFreeformItemAction(id, label);
      refreshAfter(result, "Renamed");
    });
  }

  /** Record, change or clear the time a freeform activity actually took. */
  function logActual(id: string, minutes: number | null) {
    startTransition(async () => {
      const result = await logActualMinutesAction({ itemId: id, actualMinutes: minutes });
      refreshAfter(result, minutes === null ? "Cleared" : `Logged ${formatDuration(minutes)}`);
    });
  }

  function remove(item: DayPlanItem, title: string) {
    startTransition(async () => {
      const result = await removePlanItemAction(item.id);
      refreshAfter(result, `Removed "${title}" from the plan`);
    });
  }

  /**
   * Point a planner-only category at an existing life area.
   *
   * Reuses `savePlanAction`, the SAME path the category editor uses, rather
   * than adding a second way to write an allocation. `syncAllocations` updates
   * rows in place by id, so the category keeps its id and everything already
   * inside it is untouched.
   */
  function linkLifeArea(allocationId: string, lifeAreaId: string) {
    startTransition(async () => {
      const result = await savePlanAction({
        planDate,
        allocations: allocations.map((a) => ({
          id: a.id,
          kind: a.id === allocationId ? ("life_area" as const) : a.kind,
          lifeAreaId: a.id === allocationId ? lifeAreaId : (a.lifeAreaId ?? ""),
          label: a.label,
          minutes: a.minutes,
          color: a.color ?? undefined,
          icon: a.icon ?? undefined,
        })),
      });
      const area = lifeAreas.find((a) => a.id === lifeAreaId);
      refreshAfter(result, `Linked to ${area?.name ?? "that life area"}`);
    });
  }

  /**
   * Save the CATEGORIES of this day as the reusable default day.
   *
   * Explicit and one-directional, which is the whole point of the split: days
   * are seeded FROM the default and never write back to it by themselves, so
   * shuffling Tuesday around cannot quietly change what every future morning
   * starts from.
   */
  function saveAsDefault() {
    startTransition(async () => {
      const result = await saveAsDefaultsAction({
        categories: allocations.map((a) => ({
          kind: a.kind,
          lifeAreaId: a.lifeAreaId ?? "",
          label: a.label,
          minutes: a.minutes,
          color: a.color ?? undefined,
          icon: a.icon ?? undefined,
        })),
      });
      refreshAfter(
        result,
        hasSavedDefaults ? "Default day updated" : "Saved as your default day",
      );
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
      const dayWord = isToday ? "today" : "tomorrow";
      toast.success(
        scheduled > 0
          ? `${scheduled} to-do${scheduled === 1 ? "" : "s"} added to ${dayWord}`
          : `Everything in this plan was already on ${dayWord}`,
        alreadyThere > 0 && scheduled > 0
          ? { description: `${alreadyThere} was already there.` }
          : undefined,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Day Planner"
        description="Your day, your categories. Decide where the hours go, then fill them however you like."
        action={
          <DayToggle current={planDate} today={today} tomorrow={tomorrow} disabled={pending} />
        }
      />

      {allocations.length === 0 ? (
        <EmptyPlanner
          dateLabel={dateLabel}
          hasSavedDefaults={hasSavedDefaults}
          onSeed={seed}
          pending={pending}
        />
      ) : (
        <>
          <DaySummary
            allocations={asAllocations}
            lifeAreaById={lifeAreaById}
            capacity={capacity}
            trackedMinutes={actuals.trackedMinutes}
            focusedMinutes={actuals.focusedMinutes}
            plannedTotal={plannedTotal}
            dateLabel={dateLabel}
            isToday={isToday}
            hasSavedDefaults={hasSavedDefaults}
            pending={pending}
            onEdit={() => setEditingCategories(true)}
            onSaveDefault={saveAsDefault}
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {asAllocations.map((allocation) => {
              const area = allocation.lifeAreaId
                ? (lifeAreaById.get(allocation.lifeAreaId) ?? null)
                : null;
              const allocItems = itemsByAllocation.get(allocation.id) ?? [];
              return (
                <CategoryCard
                  key={allocation.id}
                  allocation={allocation}
                  area={area}
                  color={categoryColor(allocation, area)}
                  load={categoryLoad(allocation, allocItems)}
                  actual={actuals.byAllocation.get(allocation.id)}
                  items={allocItems}
                  taskTitles={taskTitles}
                  taskById={taskById}
                  focusByTask={focusByTask}
                  linkableAreas={linkableAreas}
                  pending={pending}
                  isToday={isToday}
                  suggestionsFactory={() =>
                    suggestionsFor({
                      allocation,
                      candidates,
                      acceptedTaskIds,
                      activeGoalIds,
                      goalLifeArea,
                      today: planDate,
                    })
                  }
                  onAccept={(suggestion) => {
                    if (suggestion.minutes === null) {
                      // GoHa will not invent a duration. Ask, then accept.
                      setEstimateFor({ allocationId: allocation.id, suggestion });
                      return;
                    }
                    accept(allocation.id, suggestion, suggestion.minutes);
                  }}
                  onAddFreeform={(label, minutes) => addFreeform(allocation.id, label, minutes)}
                  onRenameFreeform={renameFreeform}
                  onLogActual={logActual}
                  onRemove={remove}
                  onLink={linkLifeArea}
                />
              );
            })}
          </div>

          {actuals.unassignedMinutes > 0 ? (
            <UnassignedFocus
              minutes={actuals.unassignedMinutes}
              sessions={actuals.unassignedSessions}
            />
          ) : null}

          <CommitBar
            isToday={isToday}
            itemCount={items.length}
            linkedCount={items.filter((item) => item.taskId !== null).length}
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
        isToday={isToday}
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
  disabled: boolean;
}) {
  const router = useRouter();
  const options: { value: string; label: string }[] = [
    { value: today, label: "Today" },
    { value: tomorrow, label: "Tomorrow" },
  ];

  return (
    <div
      className="flex rounded-xl bg-fill-tertiary p-1"
      role="group"
      aria-label="Which day to plan"
    >
      {options.map((option) => {
        const active = option.value === current;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-current={active ? "page" : undefined}
            onClick={() => router.push(`/planner?date=${option.value}`)}
            className={cn(
              "hit-44 hit-44-narrow cursor-pointer rounded-lg px-4 py-1.5 text-subhead transition-colors focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:cursor-not-allowed disabled:opacity-60",
              active
                ? "bg-surface text-label shadow-e1"
                : "text-label-secondary hover:text-label",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function EmptyPlanner({
  dateLabel,
  hasSavedDefaults,
  onSeed,
  pending,
}: {
  dateLabel: string;
  hasSavedDefaults: boolean;
  onSeed: () => void;
  pending: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary">
          <Clock className="size-6" aria-hidden />
        </span>
        <div className="max-w-md">
          <h2 className="text-headline text-label">Nothing planned for {dateLabel}</h2>
          <p className="mt-1.5 text-callout text-label-secondary">
            {hasSavedDefaults
              ? "Start from your default day, then change anything you like. Editing this day will not touch your default."
              : "Start from a normal-looking 24 hours, then rename, resize or remove anything. None of it is fixed."}
          </p>
        </div>
        <Button onClick={onSeed} loading={pending}>
          <Sparkles aria-hidden />
          {hasSavedDefaults ? "Use my default day" : "Start planning"}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * The one place the whole day is stated at once.
 *
 * Planned and actual sit side by side because the question people bring back to
 * a planner the next morning is not "what did I intend" but "where did it
 * actually go". On a day with no recorded focus the actual column simply says
 * so rather than showing a confident zero.
 */
function DaySummary({
  allocations,
  lifeAreaById,
  capacity,
  trackedMinutes,
  focusedMinutes,
  plannedTotal,
  dateLabel,
  isToday,
  hasSavedDefaults,
  pending,
  onEdit,
  onSaveDefault,
}: {
  allocations: Allocation[];
  lifeAreaById: Map<string, LifeArea>;
  capacity: ReturnType<typeof dayCapacity>;
  trackedMinutes: number;
  focusedMinutes: number;
  plannedTotal: number;
  dateLabel: string;
  isToday: boolean;
  hasSavedDefaults: boolean;
  pending: boolean;
  onEdit: () => void;
  onSaveDefault: () => void;
}) {
  // Over capacity, the strip is scaled by what was allocated rather than by 24
  // hours, so every category stays visible and the overflow is stated in words
  // instead of being drawn as a bar running off the edge.
  const scale = Math.max(MINUTES_IN_DAY, capacity.allocatedMinutes);

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-subhead text-label">{dateLabel}</p>
            <p
              className={cn(
                "mt-0.5 text-footnote",
                capacity.status === "over" ? "text-orange" : "text-label-tertiary",
              )}
            >
              {capacitySummary(capacity)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onEdit} disabled={pending}>
              <Pencil aria-hidden />
              Categories
            </Button>
            <Button variant="ghost" size="sm" onClick={onSaveDefault} disabled={pending}>
              <BookmarkCheck aria-hidden />
              {hasSavedDefaults ? "Update my default" : "Save as default"}
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
            const seg = swatch(categoryColor(allocation, area));
            return (
              <motion.span
                key={allocation.id}
                className={cn("h-full border-r border-surface last:border-r-0", seg.className)}
                style={seg.style}
                initial={{ width: 0 }}
                animate={{ width: `${(allocation.minutes / scale) * 100}%` }}
                transition={spring.smooth}
                title={`${allocation.label}: ${formatDuration(allocation.minutes)}`}
              />
            );
          })}
        </div>

        {/*
          Four numbers, and TRACKED and FOCUSED are deliberately both here.

          Focus time is a measured record; manual time is the user's own
          estimate of an activity that was never timed. Folding the two into one
          figure called "Focused" would quietly restate a guess as a
          measurement, so Tracked is the total and Focused stays exactly what
          its name says.
        */}
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryStat label="Allocated" value={formatDuration(capacity.allocatedMinutes)} hint="of 24h" />
          <SummaryStat label="Planned work" value={formatDuration(plannedTotal)} hint="in entries" />
          <SummaryStat
            label="Tracked"
            value={trackedMinutes > 0 ? formatDuration(trackedMinutes) : "--"}
            hint={trackedMinutes > 0 ? "focus + logged" : isToday ? "nothing yet" : "not started"}
            muted={trackedMinutes === 0}
          />
          <SummaryStat
            label="Focused"
            value={focusedMinutes > 0 ? formatDuration(focusedMinutes) : "--"}
            hint={focusedMinutes > 0 ? "from Focus Mode" : "no sessions"}
            muted={focusedMinutes === 0}
          />
        </dl>

        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
          {allocations.map((allocation) => {
            const area = allocation.lifeAreaId
              ? (lifeAreaById.get(allocation.lifeAreaId) ?? null)
              : null;
            const legend = swatch(categoryColor(allocation, area));
            return (
              <li
                key={allocation.id}
                className="flex items-center gap-1.5 text-footnote text-label-secondary"
              >
                <span
                  className={cn("size-2 shrink-0 rounded-full", legend.className)}
                  style={legend.style}
                  aria-hidden
                />
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

function SummaryStat({
  label,
  value,
  hint,
  muted,
}: {
  label: string;
  value: string;
  hint: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl bg-fill-quaternary px-3 py-2.5">
      <dt className="text-caption uppercase tracking-wide text-label-tertiary">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 font-mono text-title-3 tabular-nums",
          muted ? "text-label-tertiary" : "text-label",
        )}
      >
        {value}
      </dd>
      <p className="text-footnote text-label-tertiary">{hint}</p>
    </div>
  );
}

/**
 * Focus time that belongs to no category today.
 *
 * Shown rather than absorbed. Quietly adding it to whichever category looked
 * plausible would be the exact invented placement this redesign removed, and
 * the honest version is more useful anyway: it tells the user their plan and
 * their day have drifted apart.
 */
function UnassignedFocus({ minutes, sessions }: { minutes: number; sessions: number }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 py-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary">
          <Timer className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-callout text-label">
            {formatDuration(minutes)} of focus outside your plan
          </p>
          <p className="text-footnote text-label-tertiary">
            {sessions} session{sessions === 1 ? "" : "s"} on work that is not in a category today.
            Add that to-do to a category and this will count towards it.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CommitBar({
  isToday,
  itemCount,
  linkedCount,
  plannedTotal,
  capacity,
  pending,
  onCommit,
}: {
  isToday: boolean;
  itemCount: number;
  linkedCount: number;
  plannedTotal: number;
  capacity: ReturnType<typeof dayCapacity>;
  pending: boolean;
  onCommit: () => void;
}) {
  const dayWord = isToday ? "Today" : "Tomorrow";
  const freeform = itemCount - linkedCount;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-subhead text-label">
            {itemCount === 0
              ? "Nothing in the plan yet"
              : `${itemCount} entr${itemCount === 1 ? "y" : "ies"}, ${formatDuration(plannedTotal)} of work`}
          </p>
          <p className="mt-0.5 text-footnote text-label-tertiary">
            {itemCount === 0
              ? "Add your own entries, or ask for a suggestion. Nothing moves until you do."
              : linkedCount === 0
                ? "These are all your own entries, so there is nothing to schedule. They stay here on this day."
                : `Puts ${linkedCount} linked to-do${linkedCount === 1 ? "" : "s"} on ${dayWord.toLowerCase()}${freeform > 0 ? `. Your ${freeform} own entr${freeform === 1 ? "y stays" : "ies stay"} here.` : "."}`}
          </p>
          {capacity.status === "over" ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-footnote text-orange">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              Your categories add up to more than a day. Worth a second look before you commit.
            </p>
          ) : null}
        </div>
        <Button onClick={onCommit} loading={pending} disabled={pending || linkedCount === 0}>
          <CalendarCheck aria-hidden />
          Add to {dayWord}
          <ArrowRight aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One category: its hours, what is in it, and what actually happened.
 *
 * Every category is the same. There is no list of names that behave
 * differently, no category that refuses entries, and nothing GoHa decides on
 * the user's behalf. "Sleep" holds entries if the user wants it to, and a
 * category with no entries is simply reserved time, which is a legitimate and
 * common answer rather than an empty state to apologise for.
 *
 * Suggestions are PULLED. The list is not rendered until the user asks for it,
 * which is the difference between an assistant and a system that keeps putting
 * things in front of you.
 */
function CategoryCard({
  allocation,
  area,
  color,
  load,
  actual,
  items,
  taskTitles,
  taskById,
  focusByTask,
  linkableAreas,
  pending,
  isToday,
  suggestionsFactory,
  onAccept,
  onAddFreeform,
  onRenameFreeform,
  onLogActual,
  onRemove,
  onLink,
}: {
  allocation: Allocation;
  area: LifeArea | null;
  color: ResolvedColor;
  load: ReturnType<typeof categoryLoad>;
  actual: CategoryActual | undefined;
  items: DayPlanItem[];
  taskTitles: Map<string, string>;
  taskById: Map<string, Task>;
  /** Focus minutes per to-do id, for a linked entry's own actual. */
  focusByTask: Map<string, number>;
  linkableAreas: LifeArea[];
  pending: boolean;
  isToday: boolean;
  suggestionsFactory: () => Suggestion[];
  onAccept: (suggestion: Suggestion) => void;
  onAddFreeform: (label: string, minutes: number) => void;
  onRenameFreeform: (id: string, label: string) => void;
  onLogActual: (id: string, minutes: number | null) => void;
  onRemove: (item: DayPlanItem, title: string) => void;
  onLink: (allocationId: string, lifeAreaId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [loggingId, setLoggingId] = useState<string | null>(null);

  /*
   * Tomorrow can be planned in full, but it has not happened, so there is
   * nothing to record about it yet. The server refuses a future date as well;
   * this only keeps the control from appearing in the first place.
   */
  const canLogActual = isToday;

  const chip = swatch(color);
  const actualMinutes = actual?.actualMinutes ?? 0;
  const focusMinutes = actual?.focusMinutes ?? 0;
  const manualMinutes = actual?.manualMinutes ?? 0;
  const suggestions = showSuggestions ? suggestionsFactory() : [];

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col py-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="flex min-w-0 items-center gap-2 text-headline text-label">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-md text-white",
                color.tile ?? "",
              )}
              style={color.tile ? undefined : { backgroundColor: color.fill }}
            >
              <LifeAreaIcon iconKey={allocation.icon ?? area?.icon ?? null} className="size-3.5" />
            </span>
            <span className="truncate">{allocation.label}</span>
          </h3>
          <span className="shrink-0 font-mono text-callout tabular-nums text-label-secondary">
            {formatDuration(allocation.minutes)}
          </span>
        </div>

        {/* Planned against the category's own capacity, with the recorded
            focus drawn underneath it so the two are read together. */}
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
                load.overMinutes > 0 ? "bg-orange" : chip.className,
              )}
              style={{
                width: `${Math.min(100, (load.plannedMinutes / Math.max(1, load.capacityMinutes)) * 100)}%`,
                ...(load.overMinutes > 0 ? {} : chip.style),
              }}
            />
          </div>

          {/*
            The category's actual: automatic focus plus manually logged time.

            The breakdown is spelled out whenever both halves are non-zero,
            because "5h 20m tracked" invites the question "from what", and the
            answer is the difference between a measurement and an estimate.
          */}
          <div className="mt-2 flex items-center justify-between text-footnote">
            <span className="flex items-center gap-1.5 text-label-tertiary">
              <Timer className="size-3.5 shrink-0" aria-hidden />
              {actualMinutes > 0
                ? `${formatDuration(actualMinutes)} tracked`
                : isToday
                  ? "Nothing tracked yet"
                  : "Not started"}
            </span>
            {actualMinutes > 0 && load.plannedMinutes > 0 ? (
              <span className="font-mono tabular-nums text-label-tertiary">
                {Math.round((actualMinutes / load.plannedMinutes) * 100)}% of planned
              </span>
            ) : null}
          </div>
          {focusMinutes > 0 && manualMinutes > 0 ? (
            <p className="mt-0.5 text-footnote text-label-tertiary">
              {formatDuration(focusMinutes)} focus + {formatDuration(manualMinutes)} logged
            </p>
          ) : null}
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-fill-quaternary">
            <div
              className="h-full rounded-full bg-label-tertiary/50 transition-[width] duration-300"
              style={{
                width: `${Math.min(100, (actualMinutes / Math.max(1, allocation.minutes)) * 100)}%`,
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
              const title = entryTitle(item, taskTitles);
              const linked = item.taskId !== null;
              const missing = linked && !taskById.has(item.taskId ?? "");
              const entryFocus = item.taskId ? (focusByTask.get(item.taskId) ?? 0) : 0;
              return (
                <motion.li
                  key={item.id}
                  variants={listItem}
                  className="rounded-xl bg-fill-quaternary px-2.5 py-2"
                >
                  <div className="flex items-center gap-2">
                    {linked ? (
                      <Check className="size-3.5 shrink-0 text-green" aria-hidden />
                    ) : (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-label-tertiary"
                        aria-hidden
                      />
                    )}
                    {renamingId === item.id ? (
                      <InlineRename
                        initial={title}
                        onCancel={() => setRenamingId(null)}
                        onSave={(next) => {
                          setRenamingId(null);
                          if (next !== title) onRenameFreeform(item.id, next);
                        }}
                      />
                    ) : (
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-callout",
                          missing ? "italic text-label-tertiary" : "text-label",
                        )}
                      >
                        {missing ? "A to-do that has since been removed" : title}
                      </span>
                    )}
                    {!linked && renamingId !== item.id ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setRenamingId(item.id)}
                        aria-label={`Rename ${title}`}
                        className="hit-44 hit-44-narrow flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-label-tertiary transition-colors hover:text-label focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
                      >
                        <Pencil className="size-3" aria-hidden />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onRemove(item, title)}
                      aria-label={`Remove ${title} from the plan`}
                      className="hit-44 hit-44-narrow flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-label-tertiary transition-colors hover:text-red focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </div>

                  {/*
                    Planned against actual, per entry.

                    A linked entry's actual is READ from its focus sessions and
                    has no control here: Focus Mode is the tracker for to-dos,
                    and offering a second way to state the same number would let
                    the two disagree. A freeform entry has no session to draw
                    on, so it gets a manual one.
                  */}
                  {loggingId === item.id ? (
                    <ActualComposer
                      initial={item.actualMinutes}
                      pending={pending}
                      onCancel={() => setLoggingId(null)}
                      onSave={(minutes) => {
                        setLoggingId(null);
                        onLogActual(item.id, minutes);
                      }}
                    />
                  ) : (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-5 text-footnote">
                      <span className="text-label-tertiary">
                        Planned{" "}
                        <span className="font-mono tabular-nums text-label-secondary">
                          {formatDuration(item.plannedMinutes)}
                        </span>
                      </span>
                      {linked ? (
                        <span className="flex items-center gap-1 text-label-tertiary">
                          <Timer className="size-3 shrink-0" aria-hidden />
                          {entryFocus > 0 ? (
                            <>
                              Focus{" "}
                              <span className="font-mono tabular-nums text-label-secondary">
                                {formatDuration(entryFocus)}
                              </span>
                            </>
                          ) : (
                            "No focus yet"
                          )}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-label-tertiary">
                          Actual{" "}
                          <span
                            className={cn(
                              "font-mono tabular-nums",
                              item.actualMinutes === null
                                ? "text-label-tertiary"
                                : "text-label-secondary",
                            )}
                          >
                            {item.actualMinutes === null
                              ? "--"
                              : formatDuration(item.actualMinutes)}
                          </span>
                          {canLogActual ? (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => setLoggingId(item.id)}
                              className="hit-44 hit-44-narrow cursor-pointer rounded-md px-1.5 py-0.5 text-footnote text-blue underline-offset-2 transition-colors hover:underline focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
                            >
                              {item.actualMinutes === null ? "Log time" : "Edit"}
                            </button>
                          ) : null}
                        </span>
                      )}
                    </div>
                  )}
                </motion.li>
              );
            })}
          </motion.ul>
        ) : (
          <p className="mt-3 rounded-xl bg-fill-quaternary px-3 py-2.5 text-callout text-label-tertiary">
            Time reserved. Add something if you want to, or leave it as it is.
          </p>
        )}

        <div className="mt-3 flex flex-1 flex-col justify-end gap-2">
          {adding ? (
            <FreeformComposer
              pending={pending}
              onCancel={() => setAdding(false)}
              onAdd={(label, minutes) => {
                setAdding(false);
                onAddFreeform(label, minutes);
              }}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => setAdding(true)}
              >
                <Plus aria-hidden />
                Add entry
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setShowSuggestions((open) => !open)}
                aria-expanded={showSuggestions}
              >
                <Sparkles aria-hidden />
                {showSuggestions ? "Hide suggestions" : "Suggest a to-do"}
              </Button>
            </div>
          )}

          {showSuggestions ? (
            <div className="rounded-xl border border-separator-opaque p-2.5">
              {suggestions.length === 0 ? (
                <p className="text-footnote text-label-tertiary">
                  No open to-dos left to suggest. Add an entry of your own instead.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.task.id} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-callout text-label">
                          {suggestion.task.title}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 text-footnote text-label-tertiary">
                          {suggestion.reasons.length > 0
                            ? suggestion.reasons
                                .map((reason) => SUGGESTION_REASON_LABEL[reason])
                                .join(" · ")
                            : "Open work"}
                          {suggestion.minutes !== null ? (
                            <span className="font-mono tabular-nums">
                              {formatDuration(suggestion.minutes)}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() => onAccept(suggestion)}
                      >
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {allocation.kind === "planner" && linkableAreas.length > 0 ? (
                <div className="mt-2.5 border-t border-separator pt-2.5">
                  <label
                    htmlFor={`link-${allocation.id}`}
                    className="mb-1.5 flex items-center gap-1.5 text-footnote text-label-tertiary"
                  >
                    <Link2 className="size-3.5" aria-hidden />
                    Link to a life area for better suggestions
                  </label>
                  <Select
                    id={`link-${allocation.id}`}
                    value=""
                    onChange={(value) => {
                      if (value) onLink(allocation.id, value);
                    }}
                    options={[
                      { value: "", label: "Choose a life area" },
                      ...linkableAreas.map((a) => ({ value: a.id, label: a.name })),
                    ]}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Record how long a freeform activity actually took.
 *
 * Deliberately NOT a timer. Focus Mode is the tracker, and a second one for
 * "Gym" and "Netflix" would be a whole parallel system to build, explain and
 * keep in sync. This is a number the user states, during the day or after it.
 *
 * Offers the same durations the rest of GoHa offers, plus a free entry for the
 * ones that never land on a round number, and a Clear that returns the entry to
 * "not recorded" rather than to a recorded zero.
 */
function ActualComposer({
  initial,
  pending,
  onSave,
  onCancel,
}: {
  initial: number | null;
  pending: boolean;
  onSave: (minutes: number | null) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));

  function commit() {
    const trimmed = value.trim();
    if (trimmed === "") {
      onSave(null);
      return;
    }
    const minutes = Number(trimmed);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > MINUTES_IN_DAY) return;
    onSave(Math.round(minutes));
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-separator-opaque bg-surface p-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="How long it actually took">
        {TASK_ESTIMATE_OPTIONS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={pending}
            onClick={() => onSave(minutes)}
            className="hit-44 hit-44-narrow cursor-pointer rounded-md bg-fill-tertiary px-2 py-1 font-mono text-footnote tabular-nums text-label transition-colors hover:bg-fill-secondary focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
          >
            {formatEstimate(minutes) ?? `${minutes}m`}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={value}
          inputMode="numeric"
          aria-label="Actual minutes"
          placeholder="minutes"
          className="h-8 w-28"
          onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") onCancel();
          }}
        />
        <Button type="button" size="sm" onClick={commit} disabled={pending}>
          Save
        </Button>
        {initial !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => onSave(null)}
          >
            Clear
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Type an entry and how long it should take. No to-do is created. */
function FreeformComposer({
  pending,
  onAdd,
  onCancel,
}: {
  pending: boolean;
  onAdd: (label: string, minutes: number) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [minutes, setMinutes] = useState(60);

  function submit() {
    const value = label.trim();
    if (!value) return;
    onAdd(value, minutes);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-separator-opaque p-2.5">
      <Input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Client work, Gym, Admin..."
        maxLength={80}
        aria-label="What is this entry"
      />
      <div className="flex items-center gap-2">
        <Select
          value={String(minutes)}
          onChange={(value) => setMinutes(Number(value))}
          aria-label="How long"
          options={TASK_ESTIMATE_OPTIONS.map((option) => ({
            value: String(option),
            label: formatEstimate(option) ?? `${option}m`,
          }))}
        />
        <Button type="button" size="sm" onClick={submit} disabled={pending || !label.trim()}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Rename a freeform entry in place. Linked entries are named by their to-do. */
function InlineRename({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (label: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Input
      autoFocus
      value={value}
      maxLength={80}
      aria-label="Entry name"
      className="h-7 flex-1"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const next = value.trim();
        if (next) onSave(next);
        else onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const next = value.trim();
          if (next) onSave(next);
        }
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

type DraftAllocation = {
  id?: string;
  kind: "life_area" | "planner";
  lifeAreaId: string | null;
  label: string;
  minutes: number;
  color: string | null;
  icon: string | null;
};

/**
 * Editing the day's shape: add, rename, reorder, recolour, resize, remove.
 *
 * A modal rather than inline editing, because changing the split is a distinct
 * act from choosing work, and doing both on one surface made the capacity
 * number move for two unrelated reasons. The running total updates live, so the
 * consequence of every change is visible before it is saved.
 *
 * Everything here edits ONE DAY. The modal says so out loud, because the single
 * most confusing thing a planner with defaults can do is leave someone unsure
 * which of the two they just changed.
 */
function CategoryEditor({
  open,
  planDate,
  allocations,
  lifeAreas,
  isToday,
  onClose,
  onSaved,
}: {
  open: boolean;
  planDate: string;
  allocations: DayPlanAllocation[];
  lifeAreas: LifeArea[];
  isToday: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isToday ? "Today's categories" : "Tomorrow's categories"}
      description="Split 24 hours into the parts your day actually has. This changes this day only."
      className="sm:max-w-2xl"
    >
      {open ? (
        <CategoryEditorBody
          planDate={planDate}
          allocations={allocations}
          lifeAreas={lifeAreas}
          isToday={isToday}
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
  isToday,
  onClose,
  onSaved,
}: {
  planDate: string;
  allocations: DayPlanAllocation[];
  lifeAreas: LifeArea[];
  isToday: boolean;
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
      color: a.color,
      icon: a.icon,
    })),
  );
  const [newLabel, setNewLabel] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Which row has its appearance panel open. One at a time, so the list stays short. */
  const [styling, setStyling] = useState<number | null>(null);

  const capacity = dayCapacity(draft);
  const usedAreaIds = new Set(draft.map((d) => d.lifeAreaId).filter(Boolean));

  function patch(index: number, changes: Partial<DraftAllocation>) {
    setDraft((rows) => rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  }

  function setMinutes(index: number, minutes: number) {
    patch(index, { minutes: Math.max(15, Math.min(MINUTES_IN_DAY, minutes)) });
  }

  /** Reorder by one place. Buttons rather than drag: this list is short, and a
      keyboard and a touch screen both reach these without a drag surface. */
  function move(index: number, delta: number) {
    setDraft((rows) => {
      const next = [...rows];
      const target = index + delta;
      if (target < 0 || target >= next.length) return rows;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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
      { kind: "planner", lifeAreaId: null, label, minutes: 60, color: null, icon: null },
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
      {
        kind: "life_area",
        lifeAreaId: area.id,
        label: area.name,
        minutes: 60,
        color: area.color,
        icon: area.icon,
      },
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
        color: row.color ?? undefined,
        icon: row.icon ?? undefined,
      })),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(isToday ? "Today's categories saved" : "Tomorrow's categories saved");
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
        {draft.map((row, index) => {
          const resolved = row.color
            ? resolveAreaColor(row.color, row.id ?? row.label)
            : resolveAreaColor(null, row.id ?? row.label);
          const dot = swatch(resolved);
          return (
            <li
              key={row.id ?? `${row.label}-${index}`}
              className="rounded-xl border border-separator-opaque px-3 py-2"
            >
              {/*
                Wraps on a phone.

                Reorder, colour, name, a stepper, a total and a delete is more
                controls than 390px holds in one line: measured at 60px of name
                field, which clipped "Personal" and "Free time". The stepper
                group drops to its own line below the width where they all fit,
                and the name keeps a floor so it never shrinks to nothing again.
              */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${row.label} up`}
                    className="flex size-5 cursor-pointer items-center justify-center rounded text-label-tertiary transition-colors hover:text-label disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronUp className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === draft.length - 1}
                    aria-label={`Move ${row.label} down`}
                    className="flex size-5 cursor-pointer items-center justify-center rounded text-label-tertiary transition-colors hover:text-label disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronDown className="size-3.5" aria-hidden />
                  </button>
                </div>

                {/* One control for both colour and icon: the chip shows the
                    current pair and opens the pickers for that row. */}
                <button
                  type="button"
                  onClick={() => setStyling(styling === index ? null : index)}
                  aria-label={`Colour and icon for ${row.label}`}
                  aria-expanded={styling === index}
                  className={cn(
                    "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-white transition-transform hover:scale-105 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
                    dot.className,
                  )}
                  style={dot.style}
                >
                  <LifeAreaIcon iconKey={row.icon} className="size-4" />
                </button>

                <Input
                  value={row.label}
                  onChange={(e) => patch(index, { label: e.target.value })}
                  maxLength={40}
                  aria-label={`Name of category ${index + 1}`}
                  className="h-8 min-w-[7rem] flex-1"
                />

                <div className="ml-auto flex shrink-0 items-center gap-1">
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
                    onClick={() => {
                      setStyling(null);
                      setDraft((rows) => rows.filter((_, i) => i !== index));
                    }}
                    aria-label={`Remove ${row.label}`}
                    className="hit-44 ml-1 flex size-8 cursor-pointer items-center justify-center rounded-lg text-label-tertiary transition-colors hover:text-red"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>

              {styling === index ? (
                <div className="mt-3 flex flex-col gap-3 border-t border-separator pt-3">
                  <div>
                    <p className="mb-1.5 text-caption uppercase tracking-wide text-label-tertiary">
                      Colour
                    </p>
                    <ColorPicker
                      value={row.color}
                      entityId={row.id ?? row.label}
                      ariaLabel={`Colour for ${row.label}`}
                      onChange={(next) => patch(index, { color: next })}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-caption uppercase tracking-wide text-label-tertiary">
                      Icon
                    </p>
                    <IconPicker
                      value={toIconKey(row.icon)}
                      ariaLabel={`Icon for ${row.label}`}
                      onChange={(next) => patch(index, { icon: next })}
                    />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-3 border-t border-separator pt-4">
        <div>
          <label
            htmlFor="planner-new-label"
            className="mb-1.5 block text-subhead text-label-secondary"
          >
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
            Call it whatever you like. A planner category just reserves time, and it does not
            become a life area.
          </p>
        </div>

        {lifeAreas.length > 0 ? (
          <div>
            <label
              htmlFor="planner-new-area"
              className="mb-1.5 block text-subhead text-label-secondary"
            >
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
          Save this day
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
            <Button key={minutes} variant="secondary" onClick={() => onConfirm(minutes)}>
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
