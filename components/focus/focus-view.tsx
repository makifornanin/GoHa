"use client";

import { motion } from "motion/react";
import { Check, Pause, Play, Plus, Target, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  discardFocusSessionAction,
  endFocusSessionAction,
  extendFocusSessionAction,
  pauseFocusSessionAction,
  resumeFocusSessionAction,
  startFocusSessionAction,
} from "@/app/(app)/focus/actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FocusSession } from "@/db";
import {
  FOCUS_PRESETS_MINUTES,
  focusElapsedSeconds,
  formatClock,
} from "@/lib/focus";
import { springSnappy } from "@/lib/motion";
import { useFocusTimer } from "@/stores/focus-timer";
import { cn } from "@/lib/utils";

import { FocusStats, type FocusStatsData } from "./focus-stats";

type TaskOption = { id: string; title: string };

export function FocusView({
  activeSession,
  candidateTasks,
  allTaskTitles,
  stats,
  recent,
  preselectTaskId,
}: {
  activeSession: FocusSession | null;
  candidateTasks: TaskOption[];
  allTaskTitles: TaskOption[];
  stats: FocusStatsData;
  recent: FocusSession[];
  preselectTaskId?: string | null;
}) {
  const session = useFocusTimer((s) => s.session);
  const setSession = useFocusTimer((s) => s.setSession);

  // Recover the server's in-progress session (source of truth) on load / refresh.
  useEffect(() => {
    setSession(activeSession);
  }, [activeSession, setSession]);

  const taskTitleById = useMemo(
    () => new Map(allTaskTitles.map((t) => [t.id, t.title])),
    [allTaskTitles],
  );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="Focus" description="One task, one timer. Real focus time, saved." />

      {session ? (
        <ActiveTimer session={session} taskTitleById={taskTitleById} onSession={setSession} />
      ) : (
        <FocusSetup
          candidateTasks={candidateTasks}
          preselectTaskId={preselectTaskId}
          onStarted={setSession}
        />
      )}

      <FocusStats stats={stats} recent={recent} taskTitleById={taskTitleById} />
    </div>
  );
}

function FocusSetup({
  candidateTasks,
  preselectTaskId,
  onStarted,
}: {
  candidateTasks: TaskOption[];
  preselectTaskId?: string | null;
  onStarted: (session: FocusSession) => void;
}) {
  const [taskId, setTaskId] = useState(preselectTaskId ?? "");
  const [minutes, setMinutes] = useState(25);
  const [pending, startTransition] = useTransition();

  function start() {
    startTransition(async () => {
      const result = await startFocusSessionAction({
        taskId: taskId || null,
        plannedDurationSeconds: minutes * 60,
      });
      if (result.ok) onStarted(result.data);
      else toast.error(result.error);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-8">
      <div className="text-center">
        <p className="tabular font-mono text-[56px] font-semibold leading-none text-primary">
          {formatClock(minutes * 60)}
        </p>
        <p className="mt-3 text-body-md text-on-surface-variant">Choose a duration to begin</p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {FOCUS_PRESETS_MINUTES.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={minutes === preset}
            onClick={() => setMinutes(preset)}
            className={cn(
              "tabular cursor-pointer rounded-full border px-6 py-2 font-mono text-mono-md transition-colors",
              minutes === preset
                ? "border-primary bg-primary text-on-primary"
                : "border-outline-variant text-on-surface-variant hover:border-primary/70 hover:text-primary",
            )}
          >
            {preset} min
          </button>
        ))}
      </div>

      <div className="w-full">
        <label htmlFor="focus-task" className="mb-1.5 block text-label-md text-on-surface-variant">
          Focus on <span className="text-outline">(optional)</span>
        </label>
        <Select
          id="focus-task"
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          disabled={pending}
        >
          <option value="">No specific task</option>
          {candidateTasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </Select>
      </div>

      <Button
        size="lg"
        className="w-full max-w-xs rounded-full shadow-glow"
        onClick={start}
        loading={pending}
      >
        <Play />
        Start Focus Session
      </Button>
    </div>
  );
}

function ActiveTimer({
  session,
  taskTitleById,
  onSession,
}: {
  session: FocusSession;
  taskTitleById: Map<string, string>;
  onSession: (session: FocusSession | null) => void;
}) {
  const nowMs = useFocusTimer((s) => s.nowMs);
  const tick = useFocusTimer((s) => s.tick);
  const [note, setNote] = useState(session.note ?? "");
  const [pending, startTransition] = useTransition();

  const isPaused = Boolean(session.pausedAt);

  // Tick the display once a second while running (elapsed is still derived from
  // timestamps, so a slept tab or reload stays correct).
  useEffect(() => {
    if (isPaused) return;
    const id = setInterval(() => tick(), 1000);
    return () => clearInterval(id);
  }, [isPaused, session.id, tick]);

  const elapsed = focusElapsedSeconds(
    {
      startedAt: session.startedAt,
      endedAt: null,
      pausedSeconds: session.pausedSeconds,
      pausedAt: session.pausedAt,
    },
    new Date(nowMs),
  );
  const planned = session.plannedDurationSeconds ?? 0;
  const remaining = planned > 0 ? Math.max(0, planned - elapsed) : elapsed;
  const timesUp = planned > 0 && elapsed >= planned;
  const progress = planned > 0 ? Math.min(1, elapsed / planned) : 0;
  const taskTitle = session.taskId ? taskTitleById.get(session.taskId) ?? "Task" : null;

  const running = !isPaused && !timesUp;
  const numberColor = isPaused ? "text-on-surface-variant" : timesUp ? "text-warning" : "text-primary";
  const ringColor = isPaused ? "stroke-outline" : timesUp ? "stroke-warning" : "stroke-primary";
  const statusColor = isPaused ? "text-on-surface-variant" : timesUp ? "text-warning" : "text-primary";

  type SessionResult = { ok: true; data: FocusSession } | { ok: false; error: string };

  function runSession(action: () => Promise<SessionResult>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) onSession(result.data);
      else toast.error(result.error);
    });
  }

  function finish(kind: "complete" | "discard") {
    startTransition(async () => {
      const result =
        kind === "complete"
          ? await endFocusSessionAction(session.id, note)
          : await discardFocusSessionAction(session.id);
      if (result.ok) {
        onSession(null);
        if (kind === "complete") toast.success("Focus session saved");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center">
        <p className={cn("text-label-sm uppercase", statusColor)}>
          {isPaused ? "Paused" : timesUp ? "Time's up" : "Focusing"}
        </p>
        <p className="mt-1.5 text-headline-md text-on-surface">{taskTitle ?? "Open focus"}</p>
      </div>

      <div className="relative flex size-72 items-center justify-center">
        {/* Restrained active-session glow: present only while the timer runs. */}
        {running ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-6 rounded-full bg-primary/15 blur-2xl"
          />
        ) : null}
        <svg className="absolute size-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" strokeWidth="2.5" className="stroke-surface-container-highest" />
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            className={cn("transition-all", ringColor)}
            strokeDasharray={2 * Math.PI * 46}
            strokeDashoffset={2 * Math.PI * 46 * (1 - progress)}
          />
        </svg>
        <span className={cn("tabular relative font-mono text-[64px] font-semibold leading-none", numberColor)}>
          {planned > 0 ? formatClock(remaining) : formatClock(elapsed)}
        </span>
      </div>

      <div className="flex items-center gap-6">
        <button
          type="button"
          disabled={pending}
          aria-label="Discard session"
          onClick={() => finish("discard")}
          className="flex size-12 cursor-pointer items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-error disabled:opacity-50"
        >
          <X className="size-5" aria-hidden />
        </button>

        <motion.button
          type="button"
          disabled={pending}
          whileTap={{ scale: 0.94 }}
          transition={springSnappy}
          aria-label={isPaused ? "Resume" : "Pause"}
          onClick={() =>
            runSession(() =>
              isPaused ? resumeFocusSessionAction(session.id) : pauseFocusSessionAction(session.id),
            )
          }
          className={cn(
            "flex size-20 cursor-pointer items-center justify-center rounded-full bg-primary text-on-primary transition-shadow disabled:opacity-50",
            running ? "shadow-glow" : "shadow-md",
          )}
        >
          {isPaused ? <Play className="size-8" aria-hidden /> : <Pause className="size-8" aria-hidden />}
        </motion.button>

        <button
          type="button"
          disabled={pending}
          aria-label="Complete session"
          onClick={() => finish("complete")}
          className="flex size-12 cursor-pointer items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant transition-colors hover:bg-success hover:text-on-success disabled:opacity-50"
        >
          <Check className="size-5" aria-hidden />
        </button>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => runSession(() => extendFocusSessionAction(session.id))}
        className="inline-flex cursor-pointer items-center gap-1.5 text-label-md text-primary transition-opacity hover:underline disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden />
        Need more time? Add 5 minutes
      </button>

      <div className="w-full max-w-xl">
        <label htmlFor="focus-note" className="mb-1.5 flex items-center gap-1.5 text-label-md text-on-surface-variant">
          <Target className="size-4" aria-hidden />
          Session notes <span className="text-outline">(saved when you finish)</span>
        </label>
        <Textarea
          id="focus-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Capture thoughts, blockers, or distractions to handle later..."
          className="min-h-24"
        />
      </div>
    </div>
  );
}
