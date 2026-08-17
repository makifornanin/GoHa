"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Pause, Play, Target, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  discardFocusSessionAction,
  endFocusSessionAction,
  extendFocusSessionAction,
  pauseFocusSessionAction,
  resumeFocusSessionAction,
  saveFocusNoteAction,
  startFocusSessionAction,
} from "@/app/(app)/focus/actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FocusSession } from "@/db";
import {
  autoEndCountdownSeconds,
  focusElapsedSeconds,
  formatClock,
  shouldAutoEndFocusSession,
} from "@/lib/focus";
import { spring } from "@/lib/motion";
import { useFocusTimer } from "@/stores/focus-timer";
import { cn } from "@/lib/utils";

import { DurationPicker } from "./duration-picker";
import { ExtendControl } from "./extend-control";
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
  //
  // Adopt it ONLY when it identifies a different session (or clears it).
  // `activeSession` is a fresh object on every server render, so re-syncing
  // unconditionally clobbered newer local state: pause/resume/extend do not
  // revalidate this route, so a re-render would overwrite a just-paused session
  // with the stale running one. The timer then kept counting while the database
  // held it paused.
  const activeSessionId = activeSession?.id ?? null;
  useEffect(() => {
    const current = useFocusTimer.getState().session;
    if ((current?.id ?? null) !== activeSessionId) setSession(activeSession);
    // `activeSession` is intentionally read fresh; the id is what gates the sync.
  }, [activeSessionId, activeSession, setSession]);

  const taskTitleById = useMemo(
    () => new Map(allTaskTitles.map((t) => [t.id, t.title])),
    [allTaskTitles],
  );

  return (
    <div className="relative flex flex-col gap-8">
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

      <div className="relative z-10 flex flex-col gap-8">
        <PageHeader title="Focus" description="One task, one timer. Real focus time, saved." />

        {session ? (
          // Keyed by session id: the note field and the "already alerted" flags
          // belong to one session, and must reset when a different one starts.
          <ActiveTimer
            key={session.id}
            session={session}
            taskTitleById={taskTitleById}
            onSession={setSession}
          />
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
  const [minutes, setMinutes] = useState<number | null>(25);
  const [pending, startTransition] = useTransition();
  // Generated, not hardcoded. Two of this screen can be mounted at once during a
  // route transition, and a literal id="focus-task" then appears twice: invalid
  // HTML, and `label[for]` resolves to whichever copy is first in the document
  // rather than the one being looked at.
  const taskFieldId = useId();

  function start() {
    // The button is disabled without a readable duration; this is the guard for
    // the keyboard/enter path so an invalid custom value can never start a
    // session at some earlier, unrelated length (audit R-17).
    if (minutes === null) return;
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
        <p
          className={cn(
            "font-mono text-large-title tabular-nums",
            minutes === null ? "text-label-quaternary" : "text-label",
          )}
        >
          {minutes === null ? "--:--" : formatClock(minutes * 60)}
        </p>
        <p className="mt-2 text-callout text-label-secondary">
          {minutes === null ? "Enter a length you can start" : "Choose a duration to begin"}
        </p>
      </div>

      <DurationPicker minutes={minutes} onChange={setMinutes} disabled={pending} />

      <div className="w-full">
        <label htmlFor={taskFieldId} className="mb-1.5 block text-subhead text-label-secondary">
          Focus on <span className="text-label-tertiary">(optional)</span>
        </label>
        <Select
          id={taskFieldId}
          value={taskId}
          onChange={setTaskId}
          disabled={pending}
          options={[
            { value: "", label: "No specific task" },
            ...candidateTasks.map((task) => ({ value: task.id, label: task.title })),
          ]}
        />
      </div>

      <Button
        size="lg"
        className="w-full max-w-60 rounded-full"
        onClick={start}
        loading={pending}
        disabled={minutes === null}
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
  const noteFieldId = useId();
  const [pending, startTransition] = useTransition();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const { note, setNote, noteStatus, flushNote, getNote } = useSessionNote(session);

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
  const autoEndIn = isPaused ? null : autoEndCountdownSeconds(elapsed, planned || null);

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

  const finish = useCallback(
    (kind: "complete" | "discard", reason?: "auto") => {
      startTransition(async () => {
        // Flush the note first: an in-flight autosave and the finishing write
        // otherwise race, and whichever the database applies last wins.
        if (kind === "complete") await flushNote();
        const result =
          kind === "complete"
            ? await endFocusSessionAction(session.id, getNote())
            : await discardFocusSessionAction(session.id);
        if (result.ok) {
          onSession(null);
          if (kind === "complete") {
            toast.success(
              reason === "auto" ? "Focus session saved automatically" : "Focus session saved",
              reason === "auto"
                ? { description: "It had been past its planned time with nothing happening." }
                : undefined,
            );
          }
        } else {
          toast.error(result.error);
        }
      });
    },
    [flushNote, getNote, onSession, session.id],
  );

  // Time's up: say so once, in the tab and in the document title, so it lands
  // even when the page is in the background. In-tab only on purpose: no OS
  // permission prompt and no push service (CLAUDE.md section 2).
  const alertedRef = useRef(false);
  useEffect(() => {
    if (!timesUp || alertedRef.current) return;
    alertedRef.current = true;
    toast("Time's up", {
      description: taskTitle ? `Planned time reached on "${taskTitle}".` : "Planned time reached.",
      duration: 10000,
    });
  }, [timesUp, taskTitle]);

  useEffect(() => {
    if (!timesUp) return;
    const previous = document.title;
    document.title = "Time's up · GoHa";
    return () => {
      document.title = previous;
    };
  }, [timesUp]);

  // Unattended overtime completes itself (see FOCUS_AUTO_END_GRACE_SECONDS).
  // The countdown is on screen throughout, and extending resets it.
  const autoEndedRef = useRef(false);
  useEffect(() => {
    if (isPaused || autoEndedRef.current) return;
    if (!shouldAutoEndFocusSession(elapsed, planned || null)) return;
    autoEndedRef.current = true;
    finish("complete", "auto");
  }, [elapsed, planned, isPaused, finish]);

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
          onClick={() => setConfirmingDiscard(true)}
          className="hit-44 flex size-11 cursor-pointer items-center justify-center rounded-full bg-fill-tertiary text-label-secondary transition-colors hover:bg-red hover:text-white focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:opacity-50"
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
          className="hit-44 flex size-11 cursor-pointer items-center justify-center rounded-full bg-fill-tertiary text-label-secondary transition-colors hover:bg-green hover:text-white focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:opacity-50"
        >
          <Check className="size-5" aria-hidden />
        </button>
      </div>

      <ExtendControl
        disabled={pending}
        onExtend={(mins) => runSession(() => extendFocusSessionAction(session.id, mins))}
      />

      {/* Overtime is fine, silently ending is not: say when the timer will
          close itself, so auto-end is never a surprise (audit R-17). */}
      {timesUp && autoEndIn !== null ? (
        <p className="-mt-4 text-footnote text-label-tertiary" role="status">
          Completes itself in{" "}
          <span className="font-mono tabular-nums">{formatClock(autoEndIn)}</span> unless you add
          time.
        </p>
      ) : null}

      <div className="w-full max-w-xl">
        <label htmlFor={noteFieldId} className="mb-1.5 flex items-center gap-1.5 text-subhead text-label-secondary">
          <Target className="size-4" aria-hidden />
          Session notes
          <span className="text-label-tertiary" aria-live="polite">
            {noteStatus === "saving"
              ? "(saving...)"
              : noteStatus === "error"
                ? "(not saved, retrying)"
                : "(saved as you type)"}
          </span>
        </label>
        <Textarea
          id={noteFieldId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => void flushNote()}
          placeholder="Capture thoughts, blockers, or distractions to handle later..."
          className="min-h-24 bg-surface"
        />
      </div>

      <Modal
        open={confirmingDiscard}
        onClose={() => setConfirmingDiscard(false)}
        title="Discard this session?"
        description="The time and notes are deleted, not saved. Use the tick to keep them."
      >
        <div className="flex items-center justify-end gap-3 px-6 py-5">
          <Button variant="ghost" onClick={() => setConfirmingDiscard(false)}>
            Keep focusing
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setConfirmingDiscard(false);
              finish("discard");
            }}
          >
            Discard
          </Button>
        </div>
      </Modal>
    </div>
  );
}

type NoteStatus = "idle" | "saving" | "error";

/**
 * Autosave for the session note (audit R-17). The note used to live in
 * component state until the session was finished, so a reload, a crash, or a
 * misfired discard took it with them.
 *
 * Each save is an independent request with its own guard rather than a shared
 * `useTransition`: the same coupling that stranded rapid Brain Dump captures
 * (see the 2026-08-17 entry) would otherwise disable this field between
 * keystrokes.
 */
function useSessionNote(session: FocusSession) {
  const [note, setNote] = useState(session.note ?? "");
  const [noteStatus, setNoteStatus] = useState<NoteStatus>("idle");
  const savedRef = useRef(session.note ?? "");
  const noteRef = useRef(note);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionId = session.id;

  // Mirrored in an effect, not during render: callbacks that must survive
  // keystrokes (flush, finish) read the ref instead of a stale closure.
  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  const getNote = useCallback(() => noteRef.current, []);

  const flushNote = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const text = noteRef.current;
    if (text === savedRef.current) return;
    setNoteStatus("saving");
    const result = await saveFocusNoteAction(sessionId, text);
    if (result.ok) {
      savedRef.current = text;
      setNoteStatus("idle");
    } else {
      // Left un-saved on purpose: the next keystroke or the finishing write
      // tries again, and the label says so rather than claiming it is stored.
      setNoteStatus("error");
    }
  }, [sessionId]);

  useEffect(() => {
    if (note === savedRef.current) return;
    timerRef.current = setTimeout(() => void flushNote(), 800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [note, flushNote]);

  // Leaving the page (navigation or a hidden tab) is exactly when an unsaved
  // draft is most likely to be lost, so flush there too.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushNote();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void flushNote();
    };
  }, [flushNote]);

  return { note, setNote, noteStatus, flushNote, getNote };
}
