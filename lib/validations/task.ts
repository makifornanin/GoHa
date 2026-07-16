import { z } from "zod";

import { MANILA_TZ, zonedLocalToInstant } from "@/lib/date";
import {
  TASK_COMPLETION_NOTE_MAX,
  TASK_DESCRIPTION_MAX,
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
    dueAt: optionalDueAt(timeZone),
  });
}

/** Manila-default instance (client-side field validation, tests). */
export const taskFormSchema = makeTaskFormSchema();

export type TaskFormInput = z.input<typeof taskFormSchema>;
export type TaskFormValues = z.output<typeof taskFormSchema>;

export const taskIdSchema = z.uuid("That task could not be found.");

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
