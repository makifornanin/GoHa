import { z } from "zod";

import {
  DEFAULT_TIMEFRAME,
  GOAL_DESCRIPTION_MAX,
  GOAL_PROGRESS_MAX,
  GOAL_PROGRESS_MIN,
  GOAL_PROGRESS_MODES,
  GOAL_STATUS_VALUES,
  GOAL_TIMEFRAME_VALUES,
  GOAL_TITLE_MAX,
} from "@/lib/goals";

/** An optional foreign-key id: "" / undefined / null become null, else a uuid. */
function optionalUuid(message: string) {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .pipe(z.union([z.uuid(message), z.null()]));
}

/** An optional local date ("YYYY-MM-DD"), normalized to null when absent. */
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .pipe(z.union([z.iso.date("Enter a valid date."), z.null()]));

/**
 * Validation for goal create/edit input: the server boundary contract
 * (CLAUDE.md section 5). Ownership of `lifeAreaId` and `parentGoalId` cannot be
 * expressed here; the Server Action verifies both belong to the caller.
 */
export const goalFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give this goal a title.")
    .max(GOAL_TITLE_MAX, `Keep the title to ${GOAL_TITLE_MAX} characters or fewer.`),
  description: z
    .string()
    .trim()
    .max(
      GOAL_DESCRIPTION_MAX,
      `Keep the description to ${GOAL_DESCRIPTION_MAX} characters or fewer.`,
    )
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  lifeAreaId: optionalUuid("Choose a valid life area."),
  parentGoalId: optionalUuid("Choose a valid parent goal."),
  timeframe: z.enum(GOAL_TIMEFRAME_VALUES).default(DEFAULT_TIMEFRAME),
  status: z.enum(GOAL_STATUS_VALUES).default("not_started"),
  progressMode: z.enum(GOAL_PROGRESS_MODES).default("auto"),
  manualProgress: z.coerce
    .number()
    .int("Progress must be a whole number.")
    .min(GOAL_PROGRESS_MIN, `Progress must be at least ${GOAL_PROGRESS_MIN}.`)
    .max(GOAL_PROGRESS_MAX, `Progress can be at most ${GOAL_PROGRESS_MAX}.`)
    .default(0),
  startDate: optionalDate,
  targetDate: optionalDate,
});

export type GoalFormInput = z.input<typeof goalFormSchema>;
export type GoalFormValues = z.output<typeof goalFormSchema>;

export const goalIdSchema = z.uuid("That goal could not be found.");

export const goalProgressSchema = z.coerce
  .number()
  .int("Progress must be a whole number.")
  .min(GOAL_PROGRESS_MIN, `Progress must be at least ${GOAL_PROGRESS_MIN}.`)
  .max(GOAL_PROGRESS_MAX, `Progress can be at most ${GOAL_PROGRESS_MAX}.`);

export type GoalFieldErrors = Partial<Record<keyof GoalFormValues, string>>;

/** Reduce a ZodError to the first message per field, for inline form display. */
export function toGoalFieldErrors(error: z.ZodError): GoalFieldErrors {
  const errors: GoalFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) {
      errors[key as keyof GoalFormValues] = issue.message;
    }
  }
  return errors;
}
