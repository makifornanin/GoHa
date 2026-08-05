"use client";

import { AnimatePresence, motion } from "motion/react";
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
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FocusSession } from "@/db";
import {
  FOCUS_PRESETS_MINUTES,
  focusElapsedSeconds,
  formatClock,
} from "@/lib/focus";
import { spring } from "@/lib/motion";
import { useFocusTimer } from "@/stores/focus-timer";
import { cn } from "@/lib/utils";

import { FocusStats, type FocusStatsData } from "./focus-stats";

type TaskOption = { id: string; title: string };

/**
 * Focus Mode: one of the two cinematic screens (spec section 10). Large-title
 * mono tabular timer, near-empty chrome, and the canvas darkens on session
 * start (the fixed overlay sits beneath the glass chrome, so the toolbar
 * visually recedes with it).
 */
export function FocusView({
  activeSession,
  candidateTasks,
  allTaskTitles,
  stats,
  recent,
  preselectTaskId,
  timeZone,
}: {
  activeSession: FocusSession | null;
  candidateTasks: TaskOption[];
  allTaskTitles: TaskOption[];
  stats: FocusStatsData;
  recent: FocusSession[];
  preselectTaskId?: string | null;
  timeZone?: string;
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
    <div className="relative flex flex-col gap-10">
      {/* Canvas darkens while a session runs; content above stays lit. */}
      <AnimatePresence>
        {session ? (
          <motion.div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            transition={spring.smooth}
          />
        ) : null}
      </AnimatePresence>

      <div className="relative z-10 flex flex-col gap-10">
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

        <FocusStats stats={stats} recent={recent} taskTitleById={taskTitleById} timeZone={timeZone} />
      </div>
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

  const presetOptions = FOCUS_PRESETS_MINUTES.map((preset) => ({
    value: String(preset),
    label: `${preset} min`,
  }));

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
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-8">
      <div className="text-center">
        <p className="font-mono text-large-title tabular-nums text-label">
          {formatClock(minutes * 60)}
        </p>
        <p className="mt-2 text-callout text-label-secondary">Choose a duration to begin</p>
      </div>

      <SegmentedControl
        value={String(minutes)}
        onChange={(value) => setMinutes(Number(value))}
        options={presetOptions}
        ariaLabel="Session duration"
      />

      <div className="w-full">
        <label htmlFor="focus-task" className="mb-1.5 block text-subhead text-label-secondary">
          Focus on <span className="text-label-tertiary">(optional)</span>
        </label>
        <Select
          id="focus-task"
          value={taskId}
          onChange={setTaskId}
          disabled={pending}
          options={[
            { value: "", label: "No specific task" },
            ...candidateTasks.map((task) => ({ value: task.id, label: task.title })),
          ]}
        />
      </div>

      <Button size="lg" className="w-full max-w-60 rounded-full" onClick={start} loading={pending}>
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

  const numberColor = isPaused ? "text-label-secondary" : timesUp ? "text-orange" : "text-label";
  const ringColor = isPaused ? "stroke-gray-2" : timesUp ? "stroke-orange" : "stroke-blue";
  const statusColor = isPaused ? "text-label-secondary" : timesUp ? "text-orange" : "text-blue";

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
        <p className={cn("text-caption uppercase", statusColor)}>
          {isPaused ? "Paused" : timesUp ? "Time's up" : "Focusing"}
        </p>
        <p className="mt-2 text-title-3 text-label">{taskTitle ?? "Open focus"}</p>
      </div>

      <div className="relative flex size-64 items-center justify-center">
        <svg className="absolute size-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" strokeWidth="2.5" className="stroke-gray-4" />
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
        <span className={cn("font-mono text-large-title tabular-nums", numberColor)}>
          {planned > 0 ? formatClock(remaining) : formatClock(elapsed)}
        </span>
      </div>

      <div className="flex items-center gap-6">
        <button
          type="button"
          disabled={pending}
          aria-label="Discard session"
          onClick={() => finish("discard")}
          className="hit-44 flex size-11 cursor-pointer items-center justify-center rounded-full bg-surface-secondary text-label-secondary transition-colors hover:bg-red hover:text-white focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:opacity-50"
        >
          <X className="size-5" aria-hidden />
        </button>

        <motion.button
          type="button"
          disabled={pending}
          whileTap={{ scale: 0.96 }}
          transition={spring.snappy}
          aria-label={isPaused ? "Resume" : "Pause"}
          onClick={() =>
            runSession(() =>
              isPaused ? resumeFocusSessionAction(session.id) : pauseFocusSessionAction(session.id),
            )
          }
          className="flex size-16 cursor-pointer items-center justify-center rounded-full bg-blue text-white shadow-e2 transition-[filter] hover:brightness-[1.06] focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:opacity-50"
        >
          {isPaused ? <Play className="size-7" aria-hidden /> : <Pause className="size-7" aria-hidden />}
        </motion.button>

        <button
          type="button"
          disabled={pending}
          aria-label="Complete session"
          onClick={() => finish("complete")}
          className="hit-44 flex size-11 cursor-pointer items-center justify-center rounded-full bg-surface-secondary text-label-secondary transition-colors hover:bg-green hover:text-white focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:opacity-50"
        >
          <Check className="size-5" aria-hidden />
        </button>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => runSession(() => extendFocusSessionAction(session.id))}
        className="inline-flex cursor-pointer items-center gap-1.5 text-callout font-medium text-blue transition-opacity hover:underline disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden />
        Need more time? Add 5 minutes
      </button>

      <div className="w-full max-w-xl">
        <label htmlFor="focus-note" className="mb-1.5 flex items-center gap-1.5 text-subhead text-label-secondary">
          <Target className="size-4" aria-hidden />
          Session notes <span className="text-label-tertiary">(saved when you finish)</span>
        </label>
        <Textarea
          id="focus-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Capture thoughts, blockers, or distractions to handle later..."
          className="min-h-24 bg-surface"
        />
      </div>
    </div>
  );
}
