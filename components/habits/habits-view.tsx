"use client";

import { Flame, Plus, Repeat } from "lucide-react";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  archiveHabitAction,
  clearHabitEntryAction,
  createHabitAction,
  logHabitEntryAction,
  updateHabitAction,
} from "@/app/(app)/habits/actions";
import { LifeAreaIcon } from "@/components/life-areas/icon";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ProgressRing } from "@/components/today/progress-ring";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { Goal, HabitEntry, LifeArea } from "@/db";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import { buildHabitViews, todayHabitViews } from "@/lib/habit-view";
import { lifeAreaColorConfig, toColorKey } from "@/lib/life-areas";
import type { HabitFormInput } from "@/lib/validations/habit";
import { cn } from "@/lib/utils";

import { HabitFormModal } from "./habit-form-modal";
import { HabitLogControl, type LogInput } from "./habit-log-control";
import { HabitsWeekGrid } from "./habits-week-grid";

type EntryAction = { type: "upsert"; entry: HabitEntry } | { type: "remove"; habitId: string; date: string };

export function HabitsView({
  habits,
  entries,
  lifeAreas,
  goals,
  today,
  weekStartsOn = 1,
}: {
  habits: HabitWithSchedule[];
  entries: HabitEntry[];
  lifeAreas: LifeArea[];
  goals: Goal[];
  today: string;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<HabitWithSchedule | null>(null);
  const [, startTransition] = useTransition();

  const [optimisticEntries, applyEntry] = useOptimistic(entries, (state, action: EntryAction) => {
    if (action.type === "remove") {
      return state.filter((e) => !(e.habitId === action.habitId && e.entryDate === action.date));
    }
    const rest = state.filter(
      (e) => !(e.habitId === action.entry.habitId && e.entryDate === action.entry.entryDate),
    );
    return [...rest, action.entry];
  });

  const views = useMemo(
    () => buildHabitViews({ habits, entries: optimisticEntries, today, weekStartsOn }),
    [habits, optimisticEntries, today, weekStartsOn],
  );
  const scheduledToday = useMemo(() => todayHabitViews(views), [views]);
  const lifeAreaById = useMemo(() => new Map(lifeAreas.map((a) => [a.id, a])), [lifeAreas]);

  const bestStreak = views.reduce((max, v) => Math.max(max, v.streaks.current), 0);
  const doneToday = scheduledToday.filter((v) => v.todayState === "done").length;
  const completion = scheduledToday.length === 0 ? 0 : Math.round((doneToday / scheduledToday.length) * 100);

  const lifeAreaOptions = useMemo(() => lifeAreas.map((a) => ({ id: a.id, name: a.name })), [lifeAreas]);
  const goalOptions = useMemo(() => goals.map((g) => ({ id: g.id, title: g.title })), [goals]);
  const editingHabit = editingId ? habits.find((h) => h.id === editingId) ?? null : null;

  function makeEntry(habitId: string, input: LogInput): HabitEntry {
    const now = new Date();
    return {
      id: `optimistic-${habitId}-${today}`,
      userId: "",
      habitId,
      entryDate: today,
      status: input.status,
      value: input.value != null ? String(input.value) : null,
      note: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  function log(habitId: string, input: LogInput) {
    startTransition(async () => {
      applyEntry({ type: "upsert", entry: makeEntry(habitId, input) });
      const result = await logHabitEntryAction(habitId, today, input);
      if (!result.ok) toast.error(result.error);
    });
  }

  function clear(habitId: string) {
    startTransition(async () => {
      applyEntry({ type: "remove", habitId, date: today });
      const result = await clearHabitEntryAction(habitId, today);
      if (!result.ok) toast.error(result.error);
    });
  }

  async function handleCreate(formValues: HabitFormInput) {
    const result = await createHabitAction(formValues);
    if (result.ok) {
      toast.success(`Created "${result.data.name}"`);
      setFormOpen(false);
    }
    return result;
  }

  async function handleUpdate(formValues: HabitFormInput) {
    if (!editingId) return { ok: false as const, error: "Nothing to update." };
    const result = await updateHabitAction(editingId, formValues);
    if (result.ok) {
      toast.success(`Updated "${result.data.name}"`);
      setFormOpen(false);
    }
    return result;
  }

  function confirmArchive() {
    const habit = archiving;
    if (!habit) return;
    setArchiving(null);
    startTransition(async () => {
      const result = await archiveHabitAction(habit.id);
      if (result.ok) toast.success(`Archived "${habit.name}"`);
      else toast.error(result.error);
    });
  }

  function openEdit(habitId: string) {
    setEditingId(habitId);
    setFormOpen(true);
  }

  const headerActions = (
    <>
      {bestStreak > 0 ? (
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-secondary px-3 text-footnote text-label-secondary">
          <Flame className="size-3.5 text-orange" aria-hidden />
          Best streak:{" "}
          <span className="font-mono tabular-nums text-label">{bestStreak}</span>{" "}
          {bestStreak === 1 ? "day" : "days"}
        </span>
      ) : null}
      <Button
        data-testid="new-habit"
        onClick={() => {
          setEditingId(null);
          setFormOpen(true);
        }}
      >
        <Plus />
        New Habit
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Habits & Routines" description="Build systems, not just goals." action={headerActions} />

      {habits.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No habits yet"
          description="Habits are the routines that compound over time. Create one, set its schedule, and check in daily."
          action={
            <Button
              onClick={() => {
                setEditingId(null);
                setFormOpen(true);
              }}
            >
              <Plus />
              Create your first habit
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          <section className="rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1">
            <div className="mb-4 flex items-center gap-4">
              <ProgressRing percent={completion} label={`${doneToday} of ${scheduledToday.length} habits done today`} />
              <div>
                <h3 className="text-headline text-label">Today</h3>
                <p className="mt-1 font-mono text-footnote tabular-nums text-label-secondary">
                  {scheduledToday.length === 0
                    ? "No habits scheduled for today."
                    : `${doneToday} done · ${scheduledToday.length - doneToday} to go`}
                </p>
              </div>
            </div>

            {scheduledToday.length > 0 ? (
              <ul className="flex flex-col">
                {scheduledToday.map((view) => {
                  const area = view.habit.lifeAreaId ? lifeAreaById.get(view.habit.lifeAreaId) : null;
                  const color = lifeAreaColorConfig[toColorKey(view.habit.color)];
                  return (
                    <li key={view.habit.id} className="relative flex min-h-10 flex-wrap items-center gap-3 rounded-xl px-3 py-1.5 transition-colors hover:bg-surface-hover [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:bottom-0 [&:not(:last-child)]:after:left-3 [&:not(:last-child)]:after:right-0 [&:not(:last-child)]:after:h-px [&:not(:last-child)]:after:bg-separator">
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", color.tile)}>
                        <LifeAreaIcon iconKey={view.habit.icon} className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-body text-label", view.todayState === "done" && "text-label-tertiary line-through")}>
                          {view.habit.name}
                        </p>
                        <p className="flex items-center gap-2 text-footnote text-label-secondary">
                          {area ? <span className="truncate">{area.name}</span> : null}
                          {view.streaks.current > 0 ? (
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                              <Flame className="size-3 text-orange" aria-hidden />
                              {view.streaks.current}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <HabitLogControl
                        habit={{ type: view.habit.type, targetValue: view.habit.targetValue, unit: view.habit.unit }}
                        entry={view.todayEntry}
                        onLog={(input) => log(view.habit.id, input)}
                        onClear={() => clear(view.habit.id)}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          <HabitsWeekGrid views={views} onEdit={openEdit} />

          <section>
            <h3 className="mb-3 text-caption uppercase text-label-secondary">All habits</h3>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {views.map((view) => {
                const color = lifeAreaColorConfig[toColorKey(view.habit.color)];
                return (
                  <li
                    key={view.habit.id}
                    className="group flex items-center gap-3 rounded-xl border border-separator-opaque bg-surface p-3 shadow-e1 transition-shadow hover:shadow-e2"
                  >
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", color.tile)}>
                      <LifeAreaIcon iconKey={view.habit.icon} className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-label">{view.habit.name}</p>
                      <p className="text-footnote text-label-secondary">
                        Current{" "}
                        <span className="font-mono tabular-nums text-label">{view.streaks.current}</span>{" "}
                        · Best{" "}
                        <span className="font-mono tabular-nums">{view.streaks.longest}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(view.habit.id)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setArchiving(view.habit)}>
                        Archive
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}

      <HabitFormModal
        open={formOpen}
        mode={editingHabit ? "edit" : "create"}
        habit={editingHabit}
        lifeAreas={lifeAreaOptions}
        goals={goalOptions}
        onSubmit={editingHabit ? handleUpdate : handleCreate}
        onClose={() => setFormOpen(false)}
      />

      <Modal
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        title="Archive this habit?"
        description={archiving ? `"${archiving.name}" will be hidden. Its history is kept and you can restore it later.` : undefined}
      >
        <div className="flex items-center justify-end gap-3 px-6 py-5">
          <Button variant="ghost" onClick={() => setArchiving(null)}>Cancel</Button>
          <Button variant="destructive" onClick={confirmArchive}>Archive</Button>
        </div>
      </Modal>
    </div>
  );
}
