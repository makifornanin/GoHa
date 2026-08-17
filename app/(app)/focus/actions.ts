"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { focusRepo, tasksRepo, type FocusSession } from "@/db";
import {
  countedFocusSeconds,
  FOCUS_EXTEND_MAX_MINUTES,
  FOCUS_EXTEND_MIN_MINUTES,
  FOCUS_EXTEND_SECONDS,
  FOCUS_MAX_MINUTES,
  FOCUS_MIN_MINUTES,
  focusElapsedSeconds,
  resolvePausedSeconds,
} from "@/lib/focus";
import { requireUser } from "@/lib/session";
import { getDateContext } from "@/lib/user-settings";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";
const idSchema = z.uuid();
const startSchema = z.object({
  // `.nullish()`, not `.optional()`: the UI sends `taskId: null` for an open
  // focus session (no specific task). `.optional()` only permits `undefined`,
  // so every task-less session was rejected before it could start.
  taskId: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null))
    .pipe(z.union([z.uuid(), z.null()])),
  plannedDurationSeconds: z.coerce
    .number()
    .int()
    .min(FOCUS_MIN_MINUTES * 60)
    .max(FOCUS_MAX_MINUTES * 60),
});

const noteSchema = z.string().trim().max(2000).optional().transform((v) => (v && v.length > 0 ? v : null));

/** Minutes to add to a running session. Defaults to the standard increment. */
const extendMinutesSchema = z.coerce
  .number()
  .int()
  .min(FOCUS_EXTEND_MIN_MINUTES)
  .max(FOCUS_EXTEND_MAX_MINUTES)
  .default(FOCUS_EXTEND_SECONDS / 60);

/**
 * Start a focus session. Any still-open session is finalized first (as
 * abandoned, capped) so there is only ever one in-progress session and time is
 * never double counted. `taskId` ownership is verified.
 */
export async function startFocusSessionAction(input: {
  taskId?: string | null;
  plannedDurationSeconds: number;
}): Promise<ActionResult<FocusSession>> {
  const user = await requireUser();

  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    // Name the offending field: a blanket "duration" message sent users hunting
    // the wrong control.
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error:
        issue?.path[0] === "taskId"
          ? "That task could not be found."
          : "Choose a valid duration.",
    };
  }

  if (parsed.data.taskId) {
    const task = await tasksRepo.getTask(user.id, parsed.data.taskId);
    if (!task) return { ok: false, error: "That task could not be found." };
  }

  try {
    // Close out any lingering in-progress session before starting a new one.
    const now = new Date();
    for (const open of await focusRepo.listInProgressSessions(user.id)) {
      const pausedSeconds = open.pausedAt
        ? resolvePausedSeconds(open.pausedSeconds, open.pausedAt, now)
        : open.pausedSeconds;
      const raw = focusElapsedSeconds(
        { startedAt: open.startedAt, endedAt: null, pausedSeconds, pausedAt: null },
        now,
      );
      await focusRepo.finishFocusSession(user.id, open.id, {
        status: "abandoned",
        endedAt: now,
        durationSeconds: countedFocusSeconds(raw, open.plannedDurationSeconds),
        pausedSeconds,
      });
    }

    // The local date this session belongs to, in the user's saved timezone.
    // Resolved here rather than in the repository (audit R-15).
    const { today: sessionDate } = await getDateContext(user.id, now);
    const session = await focusRepo.startFocusSession(user.id, {
      sessionDate,
      taskId: parsed.data.taskId,
      plannedDurationSeconds: parsed.data.plannedDurationSeconds,
      now,
    });
    revalidatePath("/focus");
    return { ok: true, data: session };
  } catch (error) {
    console.error("startFocusSessionAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function pauseFocusSessionAction(id: string): Promise<ActionResult<FocusSession>> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "No active session." };

  try {
    const session = await focusRepo.setPaused(user.id, id, new Date());
    if (!session) {
      // Already paused or not running: return the current state rather than erroring.
      const current = await focusRepo.getFocusSession(user.id, id);
      if (current) return { ok: true, data: current };
      return { ok: false, error: "No active session." };
    }
    return { ok: true, data: session };
  } catch (error) {
    console.error("pauseFocusSessionAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function resumeFocusSessionAction(id: string): Promise<ActionResult<FocusSession>> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "No active session." };

  try {
    const session = await focusRepo.getFocusSession(user.id, id);
    if (!session || session.status !== "in_progress") return { ok: false, error: "No active session." };
    if (!session.pausedAt) return { ok: true, data: session };

    const pausedSeconds = resolvePausedSeconds(session.pausedSeconds, session.pausedAt, new Date());
    const resumed = await focusRepo.setResumed(user.id, id, pausedSeconds);
    return { ok: true, data: resumed ?? session };
  } catch (error) {
    console.error("resumeFocusSessionAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** "Need More Time?": extend the plan. Defaults to 5 minutes, or any amount. */
export async function extendFocusSessionAction(
  id: string,
  minutes?: number,
): Promise<ActionResult<FocusSession>> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "No active session." };

  const extra = extendMinutesSchema.safeParse(minutes);
  if (!extra.success) {
    return {
      ok: false,
      error: `Add between ${FOCUS_EXTEND_MIN_MINUTES} and ${FOCUS_EXTEND_MAX_MINUTES} minutes.`,
    };
  }
  const extendSeconds = extra.data * 60;

  try {
    const session = await focusRepo.getFocusSession(user.id, id);
    if (!session || session.status !== "in_progress") return { ok: false, error: "No active session." };

    const base = session.plannedDurationSeconds ?? focusElapsedSeconds({
      startedAt: session.startedAt,
      endedAt: null,
      pausedSeconds: session.pausedSeconds,
      pausedAt: session.pausedAt,
    });
    const extended = await focusRepo.extendPlannedDuration(user.id, id, base + extendSeconds);
    return { ok: true, data: extended ?? session };
  } catch (error) {
    console.error("extendFocusSessionAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Autosave the note of a running session (audit R-17). The note is part of the
 * session, not of the act of finishing it, so it is written while the timer
 * runs and survives a reload. Returns the saved text rather than the row: the
 * client is mid-edit and must not have its field replaced by a server value.
 */
export async function saveFocusNoteAction(
  id: string,
  note: string,
): Promise<ActionResult<{ note: string | null }>> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "No active session." };

  const noteResult = noteSchema.safeParse(note);
  if (!noteResult.success) return { ok: false, error: "That note is too long." };

  try {
    const saved = await focusRepo.saveSessionNote(user.id, id, noteResult.data);
    if (!saved) return { ok: false, error: "No active session." };
    return { ok: true, data: { note: saved.note } };
  } catch (error) {
    console.error("saveFocusNoteAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Complete/stop a session: persist the derived, capped duration. */
export async function endFocusSessionAction(
  id: string,
  note?: string,
): Promise<ActionResult<FocusSession>> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "No active session." };

  const noteResult = noteSchema.safeParse(note);
  if (!noteResult.success) return { ok: false, error: "That note is too long." };

  try {
    const session = await focusRepo.getFocusSession(user.id, id);
    if (!session || session.status !== "in_progress") return { ok: false, error: "No active session." };

    const now = new Date();
    const pausedSeconds = session.pausedAt
      ? resolvePausedSeconds(session.pausedSeconds, session.pausedAt, now)
      : session.pausedSeconds;
    const raw = focusElapsedSeconds(
      { startedAt: session.startedAt, endedAt: now, pausedSeconds, pausedAt: null },
      now,
    );

    const finished = await focusRepo.finishFocusSession(user.id, id, {
      status: "completed",
      endedAt: now,
      durationSeconds: countedFocusSeconds(raw, session.plannedDurationSeconds),
      pausedSeconds,
      // Only overwrite the note when the caller actually carried one; an
      // omitted note keeps whatever was autosaved during the session.
      note: note === undefined ? undefined : noteResult.data,
    });
    if (!finished) return { ok: false, error: "No active session." };
    revalidatePath("/focus");
    return { ok: true, data: finished };
  } catch (error) {
    console.error("endFocusSessionAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Discard a session started by mistake (no persisted time). */
export async function discardFocusSessionAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "No active session." };

  try {
    await focusRepo.discardFocusSession(user.id, id);
    revalidatePath("/focus");
    return { ok: true, data: { id } };
  } catch (error) {
    console.error("discardFocusSessionAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
