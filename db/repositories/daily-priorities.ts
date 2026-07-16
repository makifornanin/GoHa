import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { manilaToday, type IsoDate } from "@/lib/date";
import { db } from "../client";
import { dailyPriorities } from "../schema";
import type { DailyPriority } from "../types";

/**
 * Daily priorities repository: the Top 3 Actions per local date. User-scoped.
 * A slot references a task or holds a free-text label (enforced by a check
 * constraint); the unique (userId, priorityDate, position) keeps slots single.
 */

export async function listDailyPriorities(
  userId: string,
  date: IsoDate = manilaToday(),
): Promise<DailyPriority[]> {
  return db
    .select()
    .from(dailyPriorities)
    .where(and(eq(dailyPriorities.userId, userId), eq(dailyPriorities.priorityDate, date)))
    .orderBy(asc(dailyPriorities.position));
}

/**
 * Set (upsert) the priority at a given slot for a date. Passing a `taskId` links
 * a task; passing a `label` records a free-text priority.
 */
export async function setDailyPriority(
  userId: string,
  date: IsoDate,
  position: number,
  input: { taskId?: string | null; label?: string | null },
): Promise<DailyPriority> {
  const [row] = await db
    .insert(dailyPriorities)
    .values({ userId, priorityDate: date, position, taskId: input.taskId, label: input.label })
    .onConflictDoUpdate({
      target: [dailyPriorities.userId, dailyPriorities.priorityDate, dailyPriorities.position],
      set: { taskId: input.taskId ?? null, label: input.label ?? null, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function setDailyPriorityCompleted(
  userId: string,
  id: string,
  completed: boolean,
): Promise<DailyPriority | null> {
  const [row] = await db
    .update(dailyPriorities)
    .set({ completed })
    .where(and(eq(dailyPriorities.id, id), eq(dailyPriorities.userId, userId)))
    .returning();
  return row ?? null;
}

export async function clearDailyPriority(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(dailyPriorities)
    .where(and(eq(dailyPriorities.id, id), eq(dailyPriorities.userId, userId)))
    .returning({ id: dailyPriorities.id });
  return rows.length > 0;
}
