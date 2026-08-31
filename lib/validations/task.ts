import { z } from "zod";

import { MANILA_TZ, zonedLocalToInstant } from "@/lib/date";
import {
  TASK_COMPLETION_NOTE_MAX,
  TASK_DESCRIPTION_MAX,
  TASK_ESTIMATE_MAX_MINUTES,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  TASK_TITLE_MAX,
} from "@/lib/tasks";

/** An optional foreign-key id: "" / undefined / null become null, else a uuid. */
function optionalUuid(message: string) {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .pipe(z.union([z.uuid(message), z.null()]));
}

/** Optional local date ("YYYY-MM-DD"), normalized to null when absent. */
const optionalScheduledFor = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .pipe(z.union([z.iso.date("Enter a valid date."), z.null()]));

/** Optional zone-local datetime ("YYYY-MM-DDTHH:mm") -> a UTC instant, or null. */
function optionalDueAt(timeZone: string) {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .transform((value, ctx): Date | null => {
      if (value === null) return null;
      const instant = zonedLocalToInstant(value, timeZone);
      if (!instant) {
        ctx.addIssue({ code: "custom", message: "Enter a valid date and time." });
        return z.NEVER;
      }
      return instant;
    });
}

/**
 * Validation for task create/edit input: the server boundary contract
 * (CLAUDE.md section 5). Ownership of `goalId` and `lifeAreaId` is verified in
 * the Server Action, not here.
 *
 * A factory because the due-at wall-clock time is interpreted in the USER'S
 * timezone (from Settings): the Server Action builds the schema with the
 * caller's saved zone, so "5:00 PM" means 5 PM where the user lives.
 */
/**
 * An optional start time, "HH:MM".
 *
 * Only meaningful alongside a date, and the schema says so: a time with no day
 * is not a plan, and silently keeping it would leave a value nothing can ever
 * display. Cleared to null instead, which is what the empty field means.
 */
const optionalScheduledTime = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .pipe(
    z.union([
      z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Enter a start time as HH:MM."),
      z.null(),
    ]),
  );

/**
 * How long this is expected to take, in minutes. Optional, and null when blank.
 *
 * The column and the check constraint have existed since the first migration;
 * nothing ever wrote to them, because the value had no way in. The Day Planner
 * is what needs it, and it needs it to be TRUSTWORTHY: an estimate GoHa
 * invented would silently corrupt the one number the planner exists to get
 * right. So blank stays blank, and the planner asks rather than guesses.
 *
 * The upper bound matches the planner's own frame. Anything longer than a day
 * is not an estimate, it is a project, and the honest answer to it is a subgoal.
 */
const optionalEstimateMinutes = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((value) => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  })
  .transform((value, ctx): number | null => {
    if (value === null) return null;
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes <= 0) {
      ctx.addIssue({ code: "custom", message: "Choose how long this should take." });
      return z.NEVER;
    }
    if (minutes > TASK_ESTIMATE_MAX_MINUTES) {
      ctx.addIssue({
        code: "custom",
        message: "That is longer than a day. Break it into smaller to-dos.",
      });
      return z.NEVER;
    }
    return minutes;
  });

export function makeTaskFormSchema(timeZone: string = MANILA_TZ) {
  return z.object({
    title: z
      .string()
      .trim()
      .min(1, "Give this task a title.")
      .max(TASK_TITLE_MAX, `Keep the title to ${TASK_TITLE_MAX} characters or fewer.`),
    description: z
      .string()
      .trim()
      .max(TASK_DESCRIPTION_MAX, `Keep the description to ${TASK_DESCRIPTION_MAX} characters or fewer.`)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
    goalId: optionalUuid("Choose a valid goal."),
    lifeAreaId: optionalUuid("Choose a valid life area."),
    status: z.enum(TASK_STATUS_VALUES).default("todo"),
    priority: z.enum(TASK_PRIORITY_VALUES).default("medium"),
    scheduledFor: optionalScheduledFor,
    scheduledTime: optionalScheduledTime,
    dueAt: optionalDueAt(timeZone),
    estimateMinutes: optionalEstimateMinutes,
  });
}

/** Manila-default instance (client-side field validation, tests). */
export const taskFormSchema = makeTaskFormSchema();

export type TaskFormInput = z.input<typeof taskFormSchema>;
export type TaskFormValues = z.output<typeof taskFormSchema>;

export const taskIdSchema = z.uuid("That task could not be found.");

/** A checklist step's title. Same limit as a task; a step is still a task. */
export const subtaskTitleSchema = z
  .string()
  .trim()
  .min(1, "Give this step a title.")
  .max(TASK_TITLE_MAX, `Keep the title to ${TASK_TITLE_MAX} characters or fewer.`);

/** Optional completion feedback, normalized to null when blank. */
export const completionNoteSchema = z
  .string()
  .trim()
  .max(TASK_COMPLETION_NOTE_MAX, `Keep the note to ${TASK_COMPLETION_NOTE_MAX} characters or fewer.`)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

export type TaskFieldErrors = Partial<Record<keyof TaskFormValues, string>>;

export function toTaskFieldErrors(error: z.ZodError): TaskFieldErrors {
  const errors: TaskFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) {
      errors[key as keyof TaskFormValues] = issue.message;
    }
  }
  return errors;
}
