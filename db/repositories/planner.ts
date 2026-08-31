import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../client";
import { dayPlanAllocations, dayPlanItems, dayPlans } from "../schema";
import type { DayPlan, DayPlanAllocation, DayPlanItem } from "../types";

/**
 * Day Planner persistence. User-scoped throughout, like every repository here:
 * the session user id is always the first argument and is always part of the
 * `where`, so an id arriving from a form can only ever address rows the caller
 * already owns (CLAUDE.md section 5).
 */

export type PlanWithContents = {
  plan: DayPlan;
  allocations: DayPlanAllocation[];
  items: DayPlanItem[];
};

/** The plan for a date, or null when the user has not made one yet. */
export async function getPlan(userId: string, planDate: string): Promise<DayPlan | null> {
  const [row] = await db
    .select()
    .from(dayPlans)
    .where(and(eq(dayPlans.userId, userId), eq(dayPlans.planDate, planDate)))
    .limit(1);
  return row ?? null;
}

/**
 * The plan for a date, creating it if this is the first visit.
 *
 * `ON CONFLICT DO NOTHING` then re-read, the same shape as the Daily
 * Inspiration ledger: two requests can genuinely arrive together (a page load
 * and a quick edit), both find nothing, and both insert. The unique constraint
 * decides, and the loser adopts the winner's row rather than failing.
 */
export async function getOrCreatePlan(userId: string, planDate: string): Promise<DayPlan> {
  const existing = await getPlan(userId, planDate);
  if (existing) return existing;

  const [inserted] = await db
    .insert(dayPlans)
    .values({ userId, planDate })
    .onConflictDoNothing({ target: [dayPlans.userId, dayPlans.planDate] })
    .returning();
  if (inserted) return inserted;

  const winner = await getPlan(userId, planDate);
  if (winner) return winner;
  throw new Error("day plan could not be created or read back");
}

/** A plan and everything in it, in display order. */
export async function getPlanContents(
  userId: string,
  planDate: string,
): Promise<PlanWithContents | null> {
  const plan = await getPlan(userId, planDate);
  if (!plan) return null;

  const [allocations, items] = await Promise.all([
    db
      .select()
      .from(dayPlanAllocations)
      .where(and(eq(dayPlanAllocations.userId, userId), eq(dayPlanAllocations.dayPlanId, plan.id)))
      .orderBy(asc(dayPlanAllocations.sortOrder), asc(dayPlanAllocations.createdAt)),
    db
      .select()
      .from(dayPlanItems)
      .where(and(eq(dayPlanItems.userId, userId), eq(dayPlanItems.dayPlanId, plan.id)))
      .orderBy(asc(dayPlanItems.sortOrder), asc(dayPlanItems.createdAt)),
  ]);

  return { plan, allocations, items };
}

export type AllocationInput = {
  kind: "life_area" | "planner";
  lifeAreaId?: string | null;
  label: string;
  minutes: number;
  sortOrder?: number;
};

export async function addAllocation(
  userId: string,
  dayPlanId: string,
  input: AllocationInput,
): Promise<DayPlanAllocation> {
  const [row] = await db
    .insert(dayPlanAllocations)
    .values({
      userId,
      dayPlanId,
      kind: input.kind,
      lifeAreaId: input.lifeAreaId ?? null,
      label: input.label,
      minutes: input.minutes,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return row;
}

/**
 * Replace a plan's categories in one transaction-shaped pass.
 *
 * Deliberately NOT a delete-and-reinsert of the whole set (CLAUDE.md section 7
 * forbids exactly that): rows the user kept are UPDATED in place, so their ids
 * survive and the accepted to-dos hanging off them are not cascaded away by a
 * routine "save". Only categories the user actually removed are deleted, and
 * that deletion taking their planned items with it is the intended meaning.
 */
export async function syncAllocations(
  userId: string,
  dayPlanId: string,
  desired: (AllocationInput & { id?: string })[],
): Promise<DayPlanAllocation[]> {
  const existing = await db
    .select()
    .from(dayPlanAllocations)
    .where(and(eq(dayPlanAllocations.userId, userId), eq(dayPlanAllocations.dayPlanId, dayPlanId)));

  const keptIds = new Set(desired.map((d) => d.id).filter((id): id is string => Boolean(id)));
  const removed = existing.filter((row) => !keptIds.has(row.id)).map((row) => row.id);

  if (removed.length > 0) {
    await db
      .delete(dayPlanAllocations)
      .where(
        and(
          eq(dayPlanAllocations.userId, userId),
          eq(dayPlanAllocations.dayPlanId, dayPlanId),
          inArray(dayPlanAllocations.id, removed),
        ),
      );
  }

  const out: DayPlanAllocation[] = [];
  for (const [index, entry] of desired.entries()) {
    if (entry.id) {
      const [updated] = await db
        .update(dayPlanAllocations)
        .set({
          kind: entry.kind,
          lifeAreaId: entry.lifeAreaId ?? null,
          label: entry.label,
          minutes: entry.minutes,
          sortOrder: index,
        })
        .where(
          and(
            eq(dayPlanAllocations.userId, userId),
            eq(dayPlanAllocations.dayPlanId, dayPlanId),
            eq(dayPlanAllocations.id, entry.id),
          ),
        )
        .returning();
      // A missing row means the id was not this user's. Skip it rather than
      // recreating it, so a forged id cannot inject a category.
      if (updated) out.push(updated);
    } else {
      out.push(await addAllocation(userId, dayPlanId, { ...entry, sortOrder: index }));
    }
  }
  return out;
}

export async function removeAllocation(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(dayPlanAllocations)
    .where(and(eq(dayPlanAllocations.userId, userId), eq(dayPlanAllocations.id, id)))
    .returning({ id: dayPlanAllocations.id });
  return rows.length > 0;
}

export async function getAllocation(
  userId: string,
  id: string,
): Promise<DayPlanAllocation | null> {
  const [row] = await db
    .select()
    .from(dayPlanAllocations)
    .where(and(eq(dayPlanAllocations.userId, userId), eq(dayPlanAllocations.id, id)))
    .limit(1);
  return row ?? null;
}

/**
 * Accept a to-do into a category.
 *
 * Idempotent on (plan, task): accepting the same suggestion twice updates where
 * it sits and how long it is planned for, rather than booking its hours a
 * second time. That constraint is what stops a double-click from making the day
 * look fuller than it is.
 */
export async function addItem(
  userId: string,
  input: {
    dayPlanId: string;
    allocationId: string;
    taskId: string;
    plannedMinutes: number;
    sortOrder?: number;
  },
): Promise<DayPlanItem> {
  const [row] = await db
    .insert(dayPlanItems)
    .values({
      userId,
      dayPlanId: input.dayPlanId,
      allocationId: input.allocationId,
      taskId: input.taskId,
      plannedMinutes: input.plannedMinutes,
      sortOrder: input.sortOrder ?? 0,
    })
    .onConflictDoUpdate({
      target: [dayPlanItems.dayPlanId, dayPlanItems.taskId],
      set: {
        allocationId: input.allocationId,
        plannedMinutes: input.plannedMinutes,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function updateItemMinutes(
  userId: string,
  id: string,
  plannedMinutes: number,
): Promise<DayPlanItem | null> {
  const [row] = await db
    .update(dayPlanItems)
    .set({ plannedMinutes })
    .where(and(eq(dayPlanItems.userId, userId), eq(dayPlanItems.id, id)))
    .returning();
  return row ?? null;
}

export async function removeItem(userId: string, id: string): Promise<DayPlanItem | null> {
  const [row] = await db
    .delete(dayPlanItems)
    .where(and(eq(dayPlanItems.userId, userId), eq(dayPlanItems.id, id)))
    .returning();
  return row ?? null;
}

/**
 * Copy a plan's categories from the most recent day that had any.
 *
 * Most people's days are shaped alike, so retyping Sleep/Work/Personal every
 * morning is a tax on using the feature at all. Categories only: the accepted
 * to-dos are yesterday's decisions and are not carried forward.
 */
export async function findPreviousAllocations(
  userId: string,
  beforeDate: string,
): Promise<DayPlanAllocation[]> {
  const [previous] = await db
    .select({ id: dayPlans.id })
    .from(dayPlans)
    .innerJoin(dayPlanAllocations, eq(dayPlanAllocations.dayPlanId, dayPlans.id))
    .where(and(eq(dayPlans.userId, userId), sql`${dayPlans.planDate} < ${beforeDate}`))
    .groupBy(dayPlans.id, dayPlans.planDate)
    .orderBy(sql`${dayPlans.planDate} desc`)
    .limit(1);
  if (!previous) return [];

  return db
    .select()
    .from(dayPlanAllocations)
    .where(and(eq(dayPlanAllocations.userId, userId), eq(dayPlanAllocations.dayPlanId, previous.id)))
    .orderBy(asc(dayPlanAllocations.sortOrder));
}
