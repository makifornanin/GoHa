import type { Priority, TaskStatus } from "@/db/schema/enums";
import type { IsoDate } from "@/lib/date";
import { taskPriorityConfig } from "@/lib/tasks";

/**
 * The Day Planner's arithmetic and its recommendation rules.
 *
 * Pure, and free of Drizzle and of `server-only`, for the same reason
 * `lib/goal-progress.ts` is: these are the decisions that must not drift, and
 * the only way to keep them honest is to be able to test them exhaustively
 * without a database. The repository supplies rows; this decides what they mean.
 *
 * Two rules govern everything here, and both come from the brief:
 *
 *   1. GoHa never invents a duration. A to-do with no estimate is reported as
 *      needing one, never given a plausible default. A capacity planner whose
 *      numbers are partly fabricated is worse than no planner, because it is
 *      confidently wrong about the one thing it exists to compute.
 *
 *   2. GoHa never adds work to a day by itself. Everything below produces
 *      SUGGESTIONS. Writing them into the plan, and from there onto Today, is a
 *      separate act the user performs.
 */

/** Minutes in a day. The only fixed quantity the planner has. */
export const MINUTES_IN_DAY = 24 * 60;

/** The step the allocation control moves in: half an hour. */
export const ALLOCATION_STEP_MINUTES = 30;

/** Matches the database check on `day_plan_allocations.minutes`. */
export const ALLOCATION_MIN_MINUTES = 15;
export const ALLOCATION_MAX_MINUTES = MINUTES_IN_DAY;

/**
 * A starting point for someone whose day is empty, and nothing more.
 *
 * Chosen to add up to a recognisable 24 hours so the first thing a new user
 * sees is a full day they can adjust, not a blank form and a question they have
 * never been asked before. Sleep is first because it is the one everybody
 * forgets to count, and forgetting it is what makes a plan quietly impossible.
 *
 * Every one of these is renameable, resizable and removable the moment it lands
 * in a plan, and none of them is treated specially anywhere in the code. They
 * are a first draft of a day, not a set of categories GoHa believes in.
 */
export const STARTER_CATEGORIES: readonly { label: string; minutes: number }[] = [
  { label: "Sleep", minutes: 8 * 60 },
  { label: "Work", minutes: 8 * 60 },
  { label: "Personal", minutes: 3 * 60 },
  { label: "Meals", minutes: 90 },
  { label: "Free time", minutes: 210 },
];

export type PlannerCategoryKind = "life_area" | "planner";

export type Allocation = {
  id: string;
  kind: PlannerCategoryKind;
  lifeAreaId: string | null;
  label: string;
  minutes: number;
  sortOrder: number;
  color: string | null;
  icon: string | null;
};

/**
 * An entry inside a category: a linked to-do, or the user's own line of text.
 *
 * Reserved time is deliberately NOT a third variant. A category with minutes
 * and no entries already means "these hours are spoken for, the detail is not
 * decided yet", and inventing an empty row to say the same thing would put a
 * blank line in the UI that nobody can name, edit or complete.
 */
export type PlanEntry = {
  id: string;
  allocationId: string;
  taskId: string | null;
  label: string | null;
  plannedMinutes: number;
  /**
   * Manually recorded time, for a freeform entry only. Null means "not
   * recorded yet", which the UI shows differently from a recorded zero. A
   * linked entry is always null here: its actual comes from focus sessions.
   */
  actualMinutes: number | null;
  sortOrder: number;
};

/** The display name of an entry, whichever kind it is. */
export function entryTitle(
  entry: Pick<PlanEntry, "taskId" | "label">,
  taskTitles: ReadonlyMap<string, string>,
): string {
  if (entry.taskId) return taskTitles.get(entry.taskId) ?? "To-do";
  return entry.label ?? "Untitled";
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

export type CapacityStatus = "under" | "exact" | "over";

export type DayCapacity = {
  allocatedMinutes: number;
  /** Positive when there is room left, 0 when the day is exactly full. */
  remainingMinutes: number;
  /** Positive only when over; 0 otherwise. Always a positive overage. */
  overMinutes: number;
  status: CapacityStatus;
};

/**
 * How the 24 hours have been spent, and whether that is possible.
 *
 * Over-allocation is reported plainly and never blocked. Someone who has
 * written down 25 hours has learned something true about their day, and the
 * useful response is to show them the extra hour, not to refuse the change and
 * make them guess which category to cut before they can save.
 */
export function dayCapacity(allocations: readonly Pick<Allocation, "minutes">[]): DayCapacity {
  const allocatedMinutes = allocations.reduce((sum, a) => sum + Math.max(0, a.minutes), 0);
  const difference = MINUTES_IN_DAY - allocatedMinutes;
  return {
    allocatedMinutes,
    remainingMinutes: Math.max(0, difference),
    overMinutes: Math.max(0, -difference),
    status: difference > 0 ? "under" : difference === 0 ? "exact" : "over",
  };
}

export type CategoryLoad = {
  allocationId: string;
  /** Minutes reserved for the category. */
  capacityMinutes: number;
  /** Minutes already committed to accepted to-dos. */
  plannedMinutes: number;
  /** Capacity minus planned; never below zero. */
  freeMinutes: number;
  /** Planned minus capacity; positive only when the category is overbooked. */
  overMinutes: number;
};

/** How full one category is. `items` are the to-dos already accepted into it. */
export function categoryLoad(
  allocation: Pick<Allocation, "id" | "minutes">,
  items: readonly { plannedMinutes: number }[],
): CategoryLoad {
  const plannedMinutes = items.reduce((sum, item) => sum + Math.max(0, item.plannedMinutes), 0);
  return {
    allocationId: allocation.id,
    capacityMinutes: allocation.minutes,
    plannedMinutes,
    freeMinutes: Math.max(0, allocation.minutes - plannedMinutes),
    overMinutes: Math.max(0, plannedMinutes - allocation.minutes),
  };
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

/** The minimum a to-do needs to be considered for a day. */
export type PlannerCandidate = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  lifeAreaId: string | null;
  goalId: string | null;
  scheduledFor: IsoDate | null;
  dueDate: IsoDate | null;
  estimateMinutes: number | null;
  sortOrder: number;
  createdAt: Date;
};

export type SuggestionReason = "overdue" | "due_soon" | "scheduled" | "priority" | "goal";

export type Suggestion = {
  task: PlannerCandidate;
  /** Why it was offered, most important reason first. Shown to the user. */
  reasons: SuggestionReason[];
  /** The ranking value. Higher is offered sooner. Exposed for tests. */
  score: number;
  /** The estimate, or null when the to-do has none and one must be asked for. */
  minutes: number | null;
};

export const SUGGESTION_REASON_LABEL: Record<SuggestionReason, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  scheduled: "Planned for today",
  priority: "High priority",
  goal: "Moves an active goal",
};

/** How many days ahead counts as "due soon" for ranking purposes. */
export const DUE_SOON_DAYS = 3;

/**
 * How much a to-do gains for already living in this category's life area.
 *
 * Larger than any single reason score, so an area's own work sorts above
 * unrelated work, and smaller than two reasons combined, so a to-do that is
 * overdue AND due soon elsewhere can still surface. Preference, not a gate.
 */
export const AREA_MATCH_BONUS = 6;

/**
 * Rank one to-do for one day.
 *
 * The order the brief asks for, expressed as additive weights rather than a
 * chain of comparators, so a to-do that is BOTH overdue and high priority
 * outranks one that is merely overdue. The bands are spaced far enough apart
 * that the intended precedence still holds: nothing high-priority can climb
 * over something overdue on priority alone.
 */
export function scoreCandidate(
  task: PlannerCandidate,
  params: { today: IsoDate; activeGoalIds: ReadonlySet<string> },
): { score: number; reasons: SuggestionReason[] } {
  const reasons: SuggestionReason[] = [];
  let score = 0;

  const anchor = task.scheduledFor ?? task.dueDate;
  if (anchor && anchor < params.today) {
    score += 1000;
    reasons.push("overdue");
  } else if (task.dueDate && task.dueDate <= addDaysIso(params.today, DUE_SOON_DAYS)) {
    score += task.dueDate === params.today ? 600 : 400;
    reasons.push("due_soon");
  } else if (task.scheduledFor === params.today) {
    score += 500;
    reasons.push("scheduled");
  }

  const weight = taskPriorityConfig[task.priority].weight;
  score += weight * 40;
  if (weight >= 2) reasons.push("priority");

  if (task.goalId && params.activeGoalIds.has(task.goalId)) {
    score += 60;
    reasons.push("goal");
  }

  // A stable, meaningless-but-consistent tiebreak so the same day with the same
  // data always offers the same order.
  score -= Math.min(30, task.sortOrder);

  return { score, reasons };
}

/** ISO date arithmetic, local to this module so it stays dependency-free. */
function addDaysIso(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * What GoHa offers for one category, in the order it should be read.
 *
 * Filters, in this order, and each exclusion is deliberate:
 *
 *   - COMPLETED and CANCELLED work is never offered. Nothing to plan.
 *   - Work already accepted into the plan is never offered twice.
 *   - For a life-area category, only work belonging to that area or to a goal
 *     in it. For a planner-only category, work with no area at all, so a
 *     "Study" category the user invented still has something to hold.
 *
 * It does NOT filter by whether the to-do fits the remaining capacity. Whether
 * to spend the last 30 minutes on a 2-hour job is the user's call, and the UI
 * says what accepting would do to the total.
 */
export function suggestionsFor(params: {
  allocation: Allocation;
  candidates: readonly PlannerCandidate[];
  /** Ids already accepted anywhere in this plan. */
  acceptedTaskIds: ReadonlySet<string>;
  /** Goals whose status is `active`, for the goal-alignment bonus. */
  activeGoalIds: ReadonlySet<string>;
  /** Goal id -> its life area, so a to-do inherits its goal's area. */
  goalLifeArea: ReadonlyMap<string, string | null>;
  today: IsoDate;
  limit?: number;
}): Suggestion[] {
  const { allocation, candidates, acceptedTaskIds, activeGoalIds, goalLifeArea, today } = params;

  const matches = candidates.filter((task) => {
    if (task.status === "completed" || task.status === "cancelled") return false;
    return !acceptedTaskIds.has(task.id);
  });

  return matches
    .map((task): Suggestion => {
      const { score, reasons } = scoreCandidate(task, { today, activeGoalIds });
      const area = task.lifeAreaId ?? (task.goalId ? (goalLifeArea.get(task.goalId) ?? null) : null);
      /*
       * Belonging to this category's life area is a strong PREFERENCE, not a
       * filter.
       *
       * It used to be a filter, and the filter is what made the planner feel
       * like it was holding work back: a category the user invented called
       * "Deep work" could only ever be offered to-dos that belonged to no life
       * area at all, so the list was usually empty and the reason was invisible.
       * Ranking says the same thing without hiding anything, and the user
       * decides what actually goes in (the brief's "suggestions stay
       * suggestions" rule).
       */
      const matchesArea = allocation.kind === "life_area" && area === allocation.lifeAreaId;
      return {
        task,
        reasons,
        score: score + (matchesArea ? AREA_MATCH_BONUS : 0),
        minutes: task.estimateMinutes,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.task.createdAt.getTime() - b.task.createdAt.getTime() ||
        a.task.id.localeCompare(b.task.id),
    )
    .slice(0, params.limit ?? 8);
}

// ---------------------------------------------------------------------------
// Actuals: what the day really held
// ---------------------------------------------------------------------------

/** One category's planned time set against what was actually tracked. */
export type CategoryActual = {
  allocationId: string;
  plannedMinutes: number;
  /** Automatic, from focus sessions on linked to-dos in this category. */
  focusMinutes: number;
  /** Manual, from freeform entries in this category the user logged time on. */
  manualMinutes: number;
  /** The two added together. The number a category card leads with. */
  actualMinutes: number;
  /** Focus sessions only. Manual entries are not sessions and are not counted. */
  sessions: number;
};

export type DayActuals = {
  byAllocation: Map<string, CategoryActual>;
  /**
   * Focus time that belongs to no category on this day.
   *
   * Either the session had no to-do, or its to-do is not in the plan. Kept
   * separate and shown as its own line rather than folded into a category:
   * inventing a home for it would be exactly the silent auto-placement this
   * redesign exists to remove.
   */
  unassignedMinutes: number;
  unassignedSessions: number;
  /** Focus sessions across the whole day, assigned or not. */
  focusedMinutes: number;
  /** Manually logged freeform time across the whole day. */
  manualMinutes: number;
  /**
   * Everything the day actually accounted for: focus plus manual.
   *
   * Deliberately a SEPARATE number from `focusedMinutes` rather than a
   * replacement for it. Manual time is the user's own estimate of an activity
   * that was never timed; focus time is a measured record. Presenting the two
   * as one figure called "Focused" would quietly restate a guess as a
   * measurement.
   */
  trackedMinutes: number;
};

/**
 * Attribute tracked time to planner categories.
 *
 * Two sources that cannot overlap, which is what makes the sum safe:
 *
 *   LINKED entries take their actual from focus sessions. The link is
 *   indirect: a session names a to-do, and a to-do reaches a category only by
 *   having been put there in this day's plan.
 *
 *   FREEFORM entries take their actual from `actualMinutes`, which the user
 *   typed. They have no to-do, so no focus session can ever point at one.
 *
 * The database enforces that disjointness (`day_plan_items_actual_manual_only`
 * and `day_plan_items_task_or_label`), so double counting is not something this
 * function has to defend against; it would have to be stored first, and it
 * cannot be.
 *
 * Seconds are converted once, at the end, per category: rounding each session
 * first loses a minute every time two 90-second sessions meet.
 */
export function dayActuals(params: {
  allocations: readonly Pick<Allocation, "id">[];
  entries: readonly Pick<
    PlanEntry,
    "allocationId" | "taskId" | "plannedMinutes" | "actualMinutes"
  >[];
  focus: readonly { taskId: string | null; seconds: number; sessions: number }[];
}): DayActuals {
  const allocationByTask = new Map<string, string>();
  for (const entry of params.entries) {
    if (entry.taskId) allocationByTask.set(entry.taskId, entry.allocationId);
  }

  const plannedByAllocation = new Map<string, number>();
  const manualByAllocation = new Map<string, number>();
  let manualTotal = 0;
  for (const entry of params.entries) {
    plannedByAllocation.set(
      entry.allocationId,
      (plannedByAllocation.get(entry.allocationId) ?? 0) + entry.plannedMinutes,
    );
    // Null means "not recorded" and contributes nothing. A recorded zero is a
    // different statement and is summed as the zero it is.
    if (entry.taskId === null && entry.actualMinutes !== null) {
      manualByAllocation.set(
        entry.allocationId,
        (manualByAllocation.get(entry.allocationId) ?? 0) + entry.actualMinutes,
      );
      manualTotal += entry.actualMinutes;
    }
  }

  const secondsByAllocation = new Map<string, number>();
  const sessionsByAllocation = new Map<string, number>();
  let unassignedSeconds = 0;
  let unassignedSessions = 0;
  let focusSeconds = 0;

  for (const row of params.focus) {
    focusSeconds += row.seconds;
    const allocationId = row.taskId ? allocationByTask.get(row.taskId) : undefined;
    if (!allocationId) {
      unassignedSeconds += row.seconds;
      unassignedSessions += row.sessions;
      continue;
    }
    secondsByAllocation.set(
      allocationId,
      (secondsByAllocation.get(allocationId) ?? 0) + row.seconds,
    );
    sessionsByAllocation.set(
      allocationId,
      (sessionsByAllocation.get(allocationId) ?? 0) + row.sessions,
    );
  }

  const byAllocation = new Map<string, CategoryActual>();
  for (const allocation of params.allocations) {
    const focusMinutes = Math.round((secondsByAllocation.get(allocation.id) ?? 0) / 60);
    const manualMinutes = manualByAllocation.get(allocation.id) ?? 0;
    byAllocation.set(allocation.id, {
      allocationId: allocation.id,
      plannedMinutes: plannedByAllocation.get(allocation.id) ?? 0,
      focusMinutes,
      manualMinutes,
      actualMinutes: focusMinutes + manualMinutes,
      sessions: sessionsByAllocation.get(allocation.id) ?? 0,
    });
  }

  const focusedMinutes = Math.round(focusSeconds / 60);
  return {
    byAllocation,
    unassignedMinutes: Math.round(unassignedSeconds / 60),
    unassignedSessions,
    focusedMinutes,
    manualMinutes: manualTotal,
    trackedMinutes: focusedMinutes + manualTotal,
  };
}

/** Suggestions that cannot be planned precisely because nobody sized them. */
export function needsEstimate(suggestions: readonly Suggestion[]): Suggestion[] {
  return suggestions.filter((s) => s.minutes === null);
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** "8h", "1h 30m", "45m". The planner talks in hours; the data is minutes. */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * The sentence under the 24-hour bar.
 *
 * Never scolds. Being over capacity is information about the day, not a verdict
 * on the person, so the over-capacity line states the number and stops
 * (docs/TERMINOLOGY.md section 6).
 */
export function capacitySummary(capacity: DayCapacity): string {
  if (capacity.status === "over") {
    return `Over by ${formatDuration(capacity.overMinutes)}. Something will have to give.`;
  }
  if (capacity.status === "exact") return "Every hour is accounted for.";
  return `${formatDuration(capacity.remainingMinutes)} still unplanned.`;
}
