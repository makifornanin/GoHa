/**
 * Focus Mode domain logic. Pure and framework-free so the duration math is
 * exhaustively unit-tested and never trusts a decrementing browser counter.
 * Elapsed time is always DERIVED from timestamps: `startedAt`, `endedAt` (or now
 * for an in-progress session), and paused time.
 */

/** Duration presets offered in the UI (minutes). */
export const FOCUS_PRESETS_MINUTES = [15, 25, 45, 60] as const;
export const FOCUS_MIN_MINUTES = 1;
export const FOCUS_MAX_MINUTES = 240;
/** Default increment when adding time to a running session ("Need More Time?"). */
export const FOCUS_EXTEND_SECONDS = 5 * 60;
/** One-tap extend amounts, in minutes. A custom amount is also accepted. */
export const FOCUS_EXTEND_PRESETS_MINUTES = [5, 10, 15] as const;
export const FOCUS_EXTEND_MIN_MINUTES = 1;
export const FOCUS_EXTEND_MAX_MINUTES = 120;

/**
 * Parse a human duration into minutes: "90", "1h30", "1h 30m", "2h", "45m".
 * Returns null when it cannot be understood or falls outside the allowed range,
 * so the caller can show a validation message rather than guess.
 */
export function parseDurationMinutes(
  input: string,
  min = FOCUS_MIN_MINUTES,
  max = FOCUS_MAX_MINUTES,
): number | null {
  const text = input.trim().toLowerCase();
  if (text === "") return null;

  let minutes: number | null = null;

  // "1h30", "1h 30m", "1h", "1 h 30"
  const hm = text.match(/^(\d+)\s*h(?:ours?)?\s*(\d+)?\s*m?(?:in(?:ute)?s?)?$/);
  if (hm) {
    minutes = Number(hm[1]) * 60 + (hm[2] ? Number(hm[2]) : 0);
  } else {
    // "45m", "45 mins", or a bare number of minutes
    const m = text.match(/^(\d+)\s*m?(?:in(?:ute)?s?)?$/);
    if (m) minutes = Number(m[1]);
  }

  if (minutes === null || !Number.isFinite(minutes)) return null;
  if (minutes < min || minutes > max) return null;
  return minutes;
}

/**
 * Abandoned-session policy. A running session left open longer than
 * ABANDON_AFTER_SECONDS is treated as abandoned (the user walked away), so it
 * never stays in_progress forever. Counted focus time is always capped at the
 * planned duration (extendable via "Need More Time"), so leaving a timer running
 * can never inflate totals. Sessions with no plan are capped at ABANDON_MAX.
 */
export const ABANDON_AFTER_SECONDS = 12 * 60 * 60;
export const ABANDON_MAX_SECONDS = 4 * 60 * 60;

export type FocusTimestamps = {
  startedAt: Date;
  endedAt: Date | null;
  /** Accumulated seconds from already-resolved pause intervals. */
  pausedSeconds: number;
  /** Set while currently paused; the ongoing pause runs up to endedAt/now. */
  pausedAt: Date | null;
};

/**
 * Seconds actually focused so far: (end - start) minus paused time, where `end`
 * is `endedAt` for a finished session or `now` for a running one. Clamped so it
 * is never negative and never exceeds the gross elapsed window (no impossible
 * values from clock skew or a bad `pausedSeconds`).
 */
export function focusElapsedSeconds(state: FocusTimestamps, now: Date = new Date()): number {
  const end = state.endedAt ?? now;
  const grossSeconds = (end.getTime() - state.startedAt.getTime()) / 1000;
  if (!Number.isFinite(grossSeconds) || grossSeconds <= 0) return 0;

  let paused = Math.max(0, state.pausedSeconds);
  if (state.pausedAt) {
    paused += Math.max(0, (end.getTime() - state.pausedAt.getTime()) / 1000);
  }

  const elapsed = grossSeconds - paused;
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  return Math.min(Math.floor(elapsed), Math.floor(grossSeconds));
}

/** Counted (persisted) focus seconds: raw elapsed capped by the plan. */
export function countedFocusSeconds(
  rawElapsedSeconds: number,
  plannedSeconds: number | null,
): number {
  if (!Number.isFinite(rawElapsedSeconds) || rawElapsedSeconds <= 0) return 0;
  const cap = plannedSeconds && plannedSeconds > 0 ? plannedSeconds : ABANDON_MAX_SECONDS;
  return Math.min(Math.floor(rawElapsedSeconds), cap);
}

/** New accumulated paused seconds after resolving an ongoing pause at `at`. */
export function resolvePausedSeconds(
  pausedSeconds: number,
  pausedAt: Date,
  at: Date = new Date(),
): number {
  const added = Math.max(0, (at.getTime() - pausedAt.getTime()) / 1000);
  return Math.max(0, Math.floor(pausedSeconds)) + Math.floor(added);
}

/** Whether a running session has been open long enough to count as abandoned. */
export function isStaleFocusSession(startedAt: Date, now: Date = new Date()): boolean {
  return (now.getTime() - startedAt.getTime()) / 1000 > ABANDON_AFTER_SECONDS;
}

/** Format seconds as a clock, e.g. "25:00" or "1:05:00". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Format seconds as a human duration, e.g. "1h 20m", "45m", "0m". */
export function formatDurationHm(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  // Sub-minute sessions must not read as "0m", which looks like nothing was
  // recorded at all. Show the real seconds instead.
  if (minutes === 0) return `${s}s`;
  return `${minutes}m`;
}

// --- Aggregates (focus time today / week / by task / goal / life area) ---

export type FocusSessionAgg = {
  taskId: string | null;
  sessionDate: string;
  durationSeconds: number | null;
};

export type FocusBreakdown = { id: string; label: string; seconds: number };

export function aggregateFocus(params: {
  sessions: FocusSessionAgg[];
  today: string;
  tasksById: Map<string, { title: string; goalId: string | null; lifeAreaId: string | null }>;
  goalsById: Map<string, string>;
  lifeAreasById: Map<string, string>;
}): {
  todaySeconds: number;
  weekSeconds: number;
  byTask: FocusBreakdown[];
  byGoal: FocusBreakdown[];
  byLifeArea: FocusBreakdown[];
} {
  let todaySeconds = 0;
  let weekSeconds = 0;
  const byTaskMap = new Map<string, number>();
  const byGoalMap = new Map<string, number>();
  const byAreaMap = new Map<string, number>();

  for (const session of params.sessions) {
    const seconds = session.durationSeconds ?? 0;
    if (seconds <= 0) continue;
    weekSeconds += seconds;
    if (session.sessionDate === params.today) todaySeconds += seconds;
    if (!session.taskId) continue;
    byTaskMap.set(session.taskId, (byTaskMap.get(session.taskId) ?? 0) + seconds);
    const task = params.tasksById.get(session.taskId);
    if (task?.goalId) byGoalMap.set(task.goalId, (byGoalMap.get(task.goalId) ?? 0) + seconds);
    if (task?.lifeAreaId) byAreaMap.set(task.lifeAreaId, (byAreaMap.get(task.lifeAreaId) ?? 0) + seconds);
  }

  const toBreakdown = (m: Map<string, number>, resolve: (id: string) => string): FocusBreakdown[] =>
    [...m.entries()]
      .map(([id, seconds]) => ({ id, label: resolve(id), seconds }))
      .sort((a, b) => b.seconds - a.seconds);

  return {
    todaySeconds,
    weekSeconds,
    byTask: toBreakdown(byTaskMap, (id) => params.tasksById.get(id)?.title ?? "Untitled task"),
    byGoal: toBreakdown(byGoalMap, (id) => params.goalsById.get(id) ?? "Goal"),
    byLifeArea: toBreakdown(byAreaMap, (id) => params.lifeAreasById.get(id) ?? "Life area"),
  };
}
