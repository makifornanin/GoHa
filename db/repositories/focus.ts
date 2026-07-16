import "server-only";

import { and, desc, eq, gte, isNotNull, isNull, lte, ne } from "drizzle-orm";

import { manilaToday, type IsoDate } from "@/lib/date";
import { db } from "../client";
import { focusSessions } from "../schema";
import type { FocusSessionStatus } from "../schema";
import type { FocusSession } from "../types";

/** Focus sessions repository. User-scoped. PostgreSQL is the source of truth. */

export async function getFocusSession(userId: string, id: string): Promise<FocusSession | null> {
  const [row] = await db
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** The single in-progress session, if any (there is at most one per user). */
export async function getActiveFocusSession(userId: string): Promise<FocusSession | null> {
  const [row] = await db
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), eq(focusSessions.status, "in_progress")))
    .orderBy(desc(focusSessions.startedAt))
    .limit(1);
  return row ?? null;
}

export async function listInProgressSessions(userId: string): Promise<FocusSession[]> {
  return db
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), eq(focusSessions.status, "in_progress")))
    .orderBy(desc(focusSessions.startedAt));
}

export async function startFocusSession(
  userId: string,
  input: { taskId?: string | null; plannedDurationSeconds?: number | null; now?: Date } = {},
): Promise<FocusSession> {
  const now = input.now ?? new Date();
  const [row] = await db
    .insert(focusSessions)
    .values({
      userId,
      taskId: input.taskId ?? null,
      plannedDurationSeconds: input.plannedDurationSeconds ?? null,
      sessionDate: manilaToday(now),
      startedAt: now,
      pausedSeconds: 0,
      status: "in_progress",
    })
    .returning();
  return row;
}

/** Begin a pause (only if running and not already paused). */
export async function setPaused(userId: string, id: string, pausedAt: Date): Promise<FocusSession | null> {
  const [row] = await db
    .update(focusSessions)
    .set({ pausedAt })
    .where(
      and(
        eq(focusSessions.id, id),
        eq(focusSessions.userId, userId),
        eq(focusSessions.status, "in_progress"),
        isNull(focusSessions.pausedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/** Resolve a pause: store the new accumulated pausedSeconds and clear pausedAt. */
export async function setResumed(
  userId: string,
  id: string,
  pausedSeconds: number,
): Promise<FocusSession | null> {
  const [row] = await db
    .update(focusSessions)
    .set({ pausedSeconds, pausedAt: null })
    .where(
      and(
        eq(focusSessions.id, id),
        eq(focusSessions.userId, userId),
        eq(focusSessions.status, "in_progress"),
        isNotNull(focusSessions.pausedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function extendPlannedDuration(
  userId: string,
  id: string,
  plannedDurationSeconds: number,
): Promise<FocusSession | null> {
  const [row] = await db
    .update(focusSessions)
    .set({ plannedDurationSeconds })
    .where(
      and(
        eq(focusSessions.id, id),
        eq(focusSessions.userId, userId),
        eq(focusSessions.status, "in_progress"),
      ),
    )
    .returning();
  return row ?? null;
}

/** Finalize a session (completed or abandoned) with a derived duration. */
export async function finishFocusSession(
  userId: string,
  id: string,
  input: {
    status: Extract<FocusSessionStatus, "completed" | "abandoned">;
    endedAt: Date;
    durationSeconds: number;
    pausedSeconds: number;
    note?: string | null;
  },
): Promise<FocusSession | null> {
  const [row] = await db
    .update(focusSessions)
    .set({
      status: input.status,
      endedAt: input.endedAt,
      durationSeconds: input.durationSeconds,
      pausedSeconds: input.pausedSeconds,
      pausedAt: null,
      note: input.note ?? null,
    })
    .where(
      and(
        eq(focusSessions.id, id),
        eq(focusSessions.userId, userId),
        eq(focusSessions.status, "in_progress"),
      ),
    )
    .returning();
  return row ?? null;
}

/** Discard an in-progress session outright (e.g. started by mistake). */
export async function discardFocusSession(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(focusSessions)
    .where(
      and(
        eq(focusSessions.id, id),
        eq(focusSessions.userId, userId),
        eq(focusSessions.status, "in_progress"),
      ),
    )
    .returning({ id: focusSessions.id });
  return rows.length > 0;
}

/** Completed sessions within an inclusive local-date range (for aggregates). */
export async function listCompletedSessionsInRange(
  userId: string,
  range: { from: IsoDate; to: IsoDate },
): Promise<FocusSession[]> {
  return db
    .select()
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        eq(focusSessions.status, "completed"),
        gte(focusSessions.sessionDate, range.from),
        lte(focusSessions.sessionDate, range.to),
      ),
    )
    .orderBy(desc(focusSessions.startedAt));
}

/** Recent finished sessions (completed or abandoned) for the history list. */
export async function listRecentSessions(userId: string, limit = 8): Promise<FocusSession[]> {
  return db
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), ne(focusSessions.status, "in_progress")))
    .orderBy(desc(focusSessions.startedAt))
    .limit(limit);
}
