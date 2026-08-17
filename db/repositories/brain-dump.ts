import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, ne, sql } from "drizzle-orm";

import { GOAL_TITLE_MAX } from "@/lib/goals";
import { HABIT_NAME_MAX } from "@/lib/habits";
import { TASK_TITLE_MAX } from "@/lib/tasks";
import { db } from "../client";
import { brainDumpItems } from "../schema";
import type { BrainDumpStatus } from "../schema";
import type { BrainDumpItem } from "../types";

/** Brain Dump repository. Fast capture inbox that flows into entities. User-scoped. */

export type ConvertTarget = "task" | "goal" | "habit";

export async function listBrainDumpItems(
  userId: string,
  status: BrainDumpStatus = "inbox",
): Promise<BrainDumpItem[]> {
  return db
    .select()
    .from(brainDumpItems)
    .where(and(eq(brainDumpItems.userId, userId), eq(brainDumpItems.status, status)))
    .orderBy(asc(brainDumpItems.sortOrder), desc(brainDumpItems.createdAt));
}

/** All of a user's items (any status). The page filters by tab client-side. */
export async function listAllBrainDumpItems(userId: string): Promise<BrainDumpItem[]> {
  return db
    .select()
    .from(brainDumpItems)
    .where(eq(brainDumpItems.userId, userId))
    .orderBy(desc(brainDumpItems.createdAt));
}

export async function getBrainDumpItem(userId: string, id: string): Promise<BrainDumpItem | null> {
  const [row] = await db
    .select()
    .from(brainDumpItems)
    .where(and(eq(brainDumpItems.id, id), eq(brainDumpItems.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createBrainDumpItem(userId: string, content: string): Promise<BrainDumpItem> {
  const [row] = await db.insert(brainDumpItems).values({ userId, content }).returning();
  return row;
}

/** Edit an inbox/archived item's content or colour (never a converted one). */
export async function updateBrainDumpItem(
  userId: string,
  id: string,
  input: { content?: string; sortOrder?: number; color?: string | null },
): Promise<BrainDumpItem | null> {
  const [row] = await db
    .update(brainDumpItems)
    .set(input)
    .where(
      and(
        eq(brainDumpItems.id, id),
        eq(brainDumpItems.userId, userId),
        ne(brainDumpItems.status, "converted"),
      ),
    )
    .returning();
  return row ?? null;
}

export async function archiveBrainDumpItem(userId: string, id: string): Promise<BrainDumpItem | null> {
  const [row] = await db
    .update(brainDumpItems)
    .set({ status: "archived" })
    .where(
      and(
        eq(brainDumpItems.id, id),
        eq(brainDumpItems.userId, userId),
        ne(brainDumpItems.status, "converted"),
      ),
    )
    .returning();
  return row ?? null;
}

export async function restoreBrainDumpItem(userId: string, id: string): Promise<BrainDumpItem | null> {
  const [row] = await db
    .update(brainDumpItems)
    .set({ status: "inbox" })
    .where(
      and(
        eq(brainDumpItems.id, id),
        eq(brainDumpItems.userId, userId),
        eq(brainDumpItems.status, "archived"),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteBrainDumpItem(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(brainDumpItems)
    .where(and(eq(brainDumpItems.id, id), eq(brainDumpItems.userId, userId)))
    .returning({ id: brainDumpItems.id });
  return rows.length > 0;
}

/**
 * Convert an item into a Task, Goal, or Habit in ONE atomic SQL statement: a
 * writable CTE that (1) locks the source row `FOR UPDATE` and only proceeds if it
 * is not already converted, (2) inserts the target entity gated on that source
 * row, and (3) marks the item converted with `converted_type` + the entity id.
 * Because both the insert and the update are gated on the same `src` row and the
 * row is locked, a double click (sequential OR concurrent) can never create two
 * entities or two conversions: the second call sees `status = 'converted'`, the
 * CTE is a no-op, and it returns null. The entity id is generated up front so the
 * whole thing is a single round-trip. Ownership is enforced in `src`.
 */
export async function convertBrainDumpItem(
  userId: string,
  itemId: string,
  target: ConvertTarget,
): Promise<{ entityId: string } | null> {
  const entityId = randomUUID();

  /*
   * Truncate to the TARGET's own edit limit (audit R-10).
   *
   * A brain dump item allows 2000 characters; a task title allows 160, a goal
   * 120, a habit 80. Converting a long thought produced a record the user could
   * never save again: opening it and pressing save failed Zod validation on a
   * field they had not touched, with a message about a limit the note itself
   * never had. Cutting at conversion keeps every converted record editable.
   *
   * Done in SQL rather than in the action because the whole conversion is one
   * atomic writable CTE, and reading the content out first to trim it in JS
   * would reintroduce the read-then-write race the CTE exists to close.
   */
  const titleLimit =
    target === "task" ? TASK_TITLE_MAX : target === "goal" ? GOAL_TITLE_MAX : HABIT_NAME_MAX;

  const statement =
    target === "task"
      ? sql`
          with src as (
            select id, content from brain_dump_items
            where id = ${itemId} and user_id = ${userId} and status <> 'converted'
            for update
          ),
          created as (
            insert into tasks (id, user_id, title)
            select ${entityId}, ${userId}, left(content, ${titleLimit}) from src
            returning id
          )
          update brain_dump_items b
          set status = 'converted', converted_type = 'task', converted_entity_id = ${entityId}, updated_at = now()
          from src, created
          where b.id = src.id
          returning b.id`
      : target === "goal"
        ? sql`
            with src as (
              select id, content from brain_dump_items
              where id = ${itemId} and user_id = ${userId} and status <> 'converted'
              for update
            ),
            created as (
              insert into goals (id, user_id, title, timeframe)
              select ${entityId}, ${userId}, left(content, ${titleLimit}), 'monthly' from src
              returning id
            )
            update brain_dump_items b
            set status = 'converted', converted_type = 'goal', converted_entity_id = ${entityId}, updated_at = now()
            from src, created
            where b.id = src.id
            returning b.id`
        : sql`
            with src as (
              select id, content from brain_dump_items
              where id = ${itemId} and user_id = ${userId} and status <> 'converted'
              for update
            ),
            created as (
              insert into habits (id, user_id, name, type)
              select ${entityId}, ${userId}, left(content, ${titleLimit}), 'boolean' from src
              returning id
            ),
            scheduled as (
              insert into habit_schedules (user_id, habit_id, frequency, is_active)
              select ${userId}, id, 'daily', true from created
              returning habit_id
            )
            update brain_dump_items b
            set status = 'converted', converted_type = 'habit', converted_entity_id = ${entityId}, updated_at = now()
            from src, created
            where b.id = src.id
            returning b.id`;

  const raw = await db.execute(statement);
  const rows: unknown[] = Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] }).rows ?? []);
  return rows.length > 0 ? { entityId } : null;
}
