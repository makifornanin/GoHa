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
 * Categories offered to someone whose day is empty.
 *
 * Chosen to add up to a recognisable 24 hours so the first thing a new user
 * sees is a full day they can adjust, not a blank form and a question they have
 * never been asked before. Sleep is first because it is the one everybody
 * forgets to count, and forgetting it is what makes a plan quietly impossible.
 */
export const STARTER_CATEGORIES: readonly { label: string; minutes: number }[] = [
  { label: "Sleep", minutes: 8 * 60 },
  { label: "Work", minutes: 8 * 60 },
  { label: "Personal", minutes: 3 * 60 },
  { label: "Meals", minutes: 90 },
  { label: "Free time", minutes: 210 },
];

/**
 * Planner-only category names that do not hold to-dos.
 *
 * Sleep is not a category you get behind on. These reserve capacity and nothing
 * else: no suggestions, no "add work here", no empty-list nag. Matched
 * case-insensitively on the label, because a planner category has no id to
 * check against and asking the user to declare the type of "Commute" would be
 * a question with an obvious answer.
 */
const NON_ACTIONABLE = new Set([
  "sleep",
  "rest",
  "commute",
  "travel",
  "free time",
  "downtime",
  "meals",
  "eating",
  "family",
  "chores",
  "errands",
]);

export type PlannerCategoryKind = "life_area" | "planner";

export type Allocation = {
  id: string;
  kind: PlannerCategoryKind;
  lifeAreaId: string | null;
  label: string;
  minutes: number;
  sortOrder: number;
};

/**
 * Whether work can be planned INTO this category.
 *
 * A life-area category always can: it exists precisely because the user files
 * goals under it. A planner-only one can unless its name is one of the reserved
 * kinds above.
 */
export function isActionable(allocation: Pick<Allocation, "kind" | "label">): boolean {
  if (allocation.kind === "life_area") return true;
  return !NON_ACTIONABLE.has(allocation.label.trim().toLowerCase());
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
  if (!isActionable(allocation)) return [];

  const matches = candidates.filter((task) => {
    if (task.status === "completed" || task.status === "cancelled") return false;
    if (acceptedTaskIds.has(task.id)) return false;

    const area = task.lifeAreaId ?? (task.goalId ? (goalLifeArea.get(task.goalId) ?? null) : null);
    if (allocation.kind === "life_area") return area === allocation.lifeAreaId;
    // A planner-only category holds work that is not claimed by any life area.
    return area === null;
  });

  return matches
    .map((task): Suggestion => {
      const { score, reasons } = scoreCandidate(task, { today, activeGoalIds });
      return { task, reasons, score, minutes: task.estimateMinutes };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.task.createdAt.getTime() - b.task.createdAt.getTime() ||
        a.task.id.localeCompare(b.task.id),
    )
    .slice(0, params.limit ?? 8);
}

/**
 * A first pass at filling a category, up to its free capacity.
 *
 * Offered as a convenience ("fill this category"), never applied on its own.
 * Greedy by rank rather than by best fit: the point is to propose the most
 * important work that fits, and a bin-packing solution that drops the top item
 * to squeeze in three small ones is optimising the wrong thing.
 *
 * To-dos with no estimate are skipped here and surfaced separately, because a
 * plan built on a guessed duration is the failure mode this feature exists to
 * avoid.
 */
export function autoFill(params: {
  suggestions: readonly Suggestion[];
  freeMinutes: number;
}): Suggestion[] {
  const chosen: Suggestion[] = [];
  let remaining = params.freeMinutes;
  for (const suggestion of params.suggestions) {
    if (suggestion.minutes === null) continue;
    if (suggestion.minutes > remaining) continue;
    chosen.push(suggestion);
    remaining -= suggestion.minutes;
    if (remaining < ALLOCATION_MIN_MINUTES) break;
  }
  return chosen;
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
