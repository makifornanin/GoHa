import { z } from "zod";

import {
  ALLOCATION_MAX_MINUTES,
  ALLOCATION_MIN_MINUTES,
  MINUTES_IN_DAY,
} from "@/lib/planner";

/**
 * The Day Planner's server boundary (CLAUDE.md section 5).
 *
 * Every id here is checked for OWNERSHIP in the Server Action as well: a uuid
 * that parses is not a uuid the caller is allowed to touch, and Zod cannot know
 * the difference.
 */

export const PLANNER_LABEL_MAX = 40;
/** A freeform entry is a short line, not a note. Long enough for "Client work: onboarding call". */
export const PLANNER_ENTRY_LABEL_MAX = 80;

const uuid = z.uuid("That item could not be found.");

/** A category name. Trimmed, and never blank, since it is the only identity a planner-only row has. */
const categoryLabel = z
  .string()
  .trim()
  .min(1, "Give this category a name.")
  .max(PLANNER_LABEL_MAX, `Keep the name to ${PLANNER_LABEL_MAX} characters or fewer.`);

const allocationMinutes = z.coerce
  .number()
  .int("Use whole minutes.")
  .min(ALLOCATION_MIN_MINUTES, `A category needs at least ${ALLOCATION_MIN_MINUTES} minutes.`)
  .max(ALLOCATION_MAX_MINUTES, "A category cannot be longer than a day.");

export const allocationInputSchema = z.object({
  /** Present when editing an existing category, absent when adding one. */
  id: uuid.optional(),
  kind: z.enum(["life_area", "planner"]),
  lifeAreaId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .pipe(z.union([uuid, z.null()])),
  label: categoryLabel,
  minutes: allocationMinutes,
  /** Presentation only. Unknown keys are normalised away by `lib/life-areas.ts`. */
  color: z.string().trim().max(24).optional().transform((v) => (v && v.length > 0 ? v : null)),
  icon: z.string().trim().max(40).optional().transform((v) => (v && v.length > 0 ? v : null)),
});

/**
 * The whole set of categories for a day, saved at once.
 *
 * The total is NOT validated against 24 hours. Over-allocating is a real state
 * the planner is built to show, and refusing the save would throw away what the
 * user typed to punish them for a discovery the feature exists to surface. The
 * ceiling below is only a sanity bound: no legitimate day has thirty categories
 * or four thousand hours in it.
 */
export const savePlanSchema = z.object({
  planDate: z.iso.date("Pick a valid date."),
  allocations: z
    .array(allocationInputSchema)
    .max(30, "That is more categories than a day can usefully hold."),
});

export type AllocationInputValues = z.output<typeof allocationInputSchema>;
export type SavePlanValues = z.output<typeof savePlanSchema>;
export type SavePlanInput = z.input<typeof savePlanSchema>;

/** Accepting one suggested to-do into one category. */
export const acceptItemSchema = z.object({
  planDate: z.iso.date("Pick a valid date."),
  allocationId: uuid,
  taskId: uuid,
  /**
   * How long the user is planning for TODAY.
   *
   * Required, and that is the point: a to-do with no estimate cannot be
   * accepted until someone says how long it takes. GoHa will not invent the
   * number, so the UI asks before this call is ever made.
   */
  plannedMinutes: z.coerce
    .number()
    .int("Use whole minutes.")
    .min(5, "Give this at least five minutes.")
    .max(MINUTES_IN_DAY, "That is longer than a day."),
});

export type AcceptItemInput = z.input<typeof acceptItemSchema>;

/** Adding the user's own line of text to a category. */
export const freeformItemSchema = z.object({
  planDate: z.iso.date("Pick a valid date."),
  allocationId: uuid,
  label: z
    .string()
    .trim()
    .min(1, "Give this entry a name.")
    .max(PLANNER_ENTRY_LABEL_MAX, `Keep it to ${PLANNER_ENTRY_LABEL_MAX} characters or fewer.`),
  plannedMinutes: z.coerce
    .number()
    .int("Use whole minutes.")
    .min(5, "Give this at least five minutes.")
    .max(MINUTES_IN_DAY, "That is longer than a day."),
  /**
   * Also create a real to-do for this entry.
   *
   * When set, the entry is stored as a LINKED one pointing at the new to-do
   * rather than as freeform text, which is why it cannot double count: there is
   * still exactly one `day_plan_items` row, and its minutes are counted once.
   */
  alsoCreateTask: z.boolean().default(false),
});

export type FreeformItemInput = z.input<typeof freeformItemSchema>;

/**
 * Recording how long a freeform activity actually took.
 *
 * Accepts null to CLEAR the record, which is a different statement from
 * logging zero and has to stay tellable apart. The ceiling is a day, matching
 * the database check; the floor is zero, because "I planned an hour of this and
 * did none of it" is a true and useful thing to record.
 */
export const logActualSchema = z.object({
  itemId: uuid,
  actualMinutes: z
    .union([
      z.coerce
        .number()
        .int("Use whole minutes.")
        .min(0, "That cannot be negative.")
        .max(MINUTES_IN_DAY, "That is longer than a day."),
      z.null(),
    ]),
});

export type LogActualInput = z.input<typeof logActualSchema>;

/**
 * Saving the current categories as the reusable default day.
 *
 * The same category shape as a plan, minus the date: a default belongs to the
 * user, not to a day. Kept as its own schema rather than reusing `savePlanSchema`
 * so that the two can never be confused at the boundary, which is the whole
 * safety property the defaults/day split is there to provide.
 */
export const saveDefaultsSchema = z.object({
  categories: z
    .array(allocationInputSchema.omit({ id: true }))
    .max(30, "That is more categories than a day can usefully hold."),
});

export type SaveDefaultsInput = z.input<typeof saveDefaultsSchema>;

export const plannerIdSchema = uuid;

export type PlannerFieldErrors = Partial<Record<string, string>>;

export function toPlannerFieldErrors(error: z.ZodError): PlannerFieldErrors {
  const errors: PlannerFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}
